// Kullanıcı yönetimi › yetkisiz erişim ekranı (Aşama 354d)
import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const YetkisizErisim: React.FC<{ onNavigateHome?: () => void }> = ({ onNavigateHome }) => (
  <div className="bg-surface border border-danger/30 rounded-2xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xl space-y-4 my-8 animate-in fade-in duration-200">
    <div className="w-16 h-16 rounded-2xl bg-danger/15 border border-danger/30 text-danger-fg flex items-center justify-center mx-auto">
      <ShieldAlert className="w-8 h-8" />
    </div>
    <h2 className="text-xl font-bold text-fg">Yetkisiz Erişim (403 Forbidden)</h2>
    <p className="text-sm text-muted leading-relaxed">
      Bu alan <strong>yetki kuralları</strong> gereği yalnızca Kurum Yöneticisi (Admin) erişimine açıktır.
    </p>
    <div className="pt-2">
      <button
        type="button"
        onClick={onNavigateHome}
        className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg border border-line min-w-24"
      >
        Öğretmen Paneline Dön
      </button>
    </div>
  </div>
);
