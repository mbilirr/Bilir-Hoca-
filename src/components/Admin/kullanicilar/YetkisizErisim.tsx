// Kullanıcı yönetimi › yetkisiz erişim ekranı (Aşama 354d)
// Aşama 405: teknik yazı ("403 Forbidden", "Admin") ve kırmızı uyarı kutusu yerine sade, Türkçe boş durum.
import React from 'react';
import { Lock } from 'lucide-react';

export const YetkisizErisim: React.FC<{ onNavigateHome?: () => void }> = ({ onNavigateHome }) => (
  <div className="bg-surface border border-line rounded-2xl p-8 sm:p-10 text-center max-w-md mx-auto shadow-sm space-y-3 my-8 animate-in fade-in duration-200">
    <div className="w-12 h-12 rounded-xl bg-surface-2 text-muted flex items-center justify-center mx-auto">
      <Lock className="w-5 h-5" aria-hidden="true" />
    </div>
    <h2 className="text-base font-bold text-fg">Bu Bölüm Kurum Yöneticisine Açık</h2>
    <p className="text-sm text-muted leading-relaxed">Hesap işleri yalnız kurum yöneticisi tarafından yapılır. Bir değişiklik gerekiyorsa kurum yöneticinize yazın.</p>
    {onNavigateHome && (
      <div className="pt-1">
        <button type="button" onClick={onNavigateHome} className="ui-btn ui-btn-sm w-32">
          Ana Sayfa
        </button>
      </div>
    )}
  </div>
);
