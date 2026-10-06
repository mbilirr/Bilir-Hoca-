import React, { lazy } from 'react';

// ============================================================================
// HIZ (Aşama 15): Sayfalar ihtiyaç olunca yüklenir.
// Giriş ekranı ve öğrenci telefonu, öğretmen sayfalarının (Excel, PDF, grafik kütüphaneleri)
// kodunu indirmek zorunda kalmaz. Her sayfa ilk açıldığında bir kez indirilir.
// ============================================================================

const RELOAD_KEY = 'edu_chunk_reload_at';

// Adlı dışa aktarımı (export const X) tembel yüklenen bileşene çevirir
export function lazyNamed<P = any>(loader: () => Promise<Record<string, any>>, name: string) {
  return lazy(async () => {
    try {
      const m = await loader();
      return { default: m[name] as React.ComponentType<P> };
    } catch (e) {
      // Yeni sürüm yayınlandıysa eski sayfa parçaları sunucuda bulunmayabilir: sayfa bir kez yenilenir
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      } catch {}
      if (Date.now() - last > 60000) {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {}
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw e;
    }
  });
}

// Sayfa parçası yüklenirken gösterilen sade gösterge
export const PageLoading: React.FC<{ label?: string }> = ({ label = 'Yükleniyor…' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status" aria-live="polite" data-testid="page-loading">
    <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
    {label}
  </div>
);
