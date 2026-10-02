import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { supabase, isPasswordRecoveryActive, onPasswordRecovery, clearPasswordRecovery } from '../../lib/supabase';

// "Şifremi unuttum" e-postasındaki bağlantıyla siteye gelindiğinde açılan yeni şifre belirleme penceresi.
export const PasswordRecoveryModal: React.FC = () => {
  const [open, setOpen] = useState<boolean>(() => isPasswordRecoveryActive());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => onPasswordRecovery(() => setOpen(true)), []);

  if (!open) return null;

  const cleanUrl = () => {
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      // yok say
    }
  };

  const handleClose = () => {
    // Şifre belirlenmeden vazgeçildiyse sıfırlama bağlantısının açtığı geçici oturumu kapat
    if (!done) {
      supabase.auth.signOut().catch(() => {});
    }
    clearPasswordRecovery();
    cleanUrl();
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setErrorMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('Yeni şifreniz en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    try {
      setIsSaving(true);
      await dataService.completePasswordRecovery(newPassword);
      cleanUrl();
      setDone(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Şifre kaydedilemedi. Bağlantının süresi dolmuş olabilir; lütfen yeniden "Şifremi unuttum" isteyiniz.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5">
      <div className="min-h-full flex items-center justify-center py-4">
        <div className="w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl p-5 space-y-4 text-fg">
          <div className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-fg">Yeni Şifre Belirle</h3>
          </div>

          {done ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Şifreniz güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.</span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Giriş ekranına dön
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-muted">
                Hesabınız için yeni bir şifre belirleyiniz (en az 6 karakter).
              </p>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni şifre"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="new-password"
                  className="w-full bg-canvas border border-line rounded-xl px-3.5 pr-10 py-2.5 text-sm text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted hover:text-fg"
                  aria-label="Şifreyi göster/gizle"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni şifre (tekrar)"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="new-password"
                className="w-full bg-canvas border border-line rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                required
              />

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-sm text-fg-2 hover:text-fg cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
