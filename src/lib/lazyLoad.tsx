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

// ============================================================================
// HIZ (Aşama 84): Sayfa parçaları önceden, tarayıcı boşken sırayla indirilir.
// Menüden bir bölüme geçildiğinde parça zaten hazırdır: "Yükleniyor…" beklemesi olmaz.
// Veri tasarrufu açık ya da bağlantı çok yavaşsa (2G) önceden indirilmez.
// ============================================================================
export function prefetchModules(loaders: Array<() => Promise<unknown>>, startDelayMs = 2500): () => void {
  if (typeof window === 'undefined' || loaders.length === 0) return () => {};
  const conn = (navigator as any).connection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(String(conn.effectiveType || '')))) return () => {};
  let cancelled = false;
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
  const next = () => {
    if (cancelled || i >= loaders.length) return;
    const load = loaders[i++];
    const run = () => {
      if (cancelled) return;
      load()
        .catch(() => {
          /* yeni sürüm yayınlandıysa parça bulunamayabilir: bölüm açılınca normal yolla yüklenir */
        })
        .finally(() => {
          if (!cancelled) timer = setTimeout(next, 300);
        });
    };
    if (ric) ric(run, { timeout: 5000 });
    else timer = setTimeout(run, 150);
  };
  timer = setTimeout(next, startDelayMs);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

// Sayfa parçası yüklenirken gösterilen sade gösterge
export const PageLoading: React.FC<{ label?: string }> = ({ label = 'Yükleniyor…' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status" aria-live="polite" data-testid="page-loading">
    <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
    {label}
  </div>
);
