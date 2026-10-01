import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

// Sitenin yeni bir sürümü yayınlandığında açık sayfada "Yenile" uyarısı gösterir.
// Nasıl çalışır: Yayındaki index.html'in yüklediği ana dosya adı (/assets/index-XXXX.js) her yayında değişir.
// Sayfa ara ara index.html'i okur; dosya adı şu an çalışan sürümden farklıysa uyarı çıkar.
// Geliştirme ortamında (AI Studio önizlemesi) /assets/ dosyası olmadığı için hiçbir şey yapmaz.

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 dakikada bir
const MIN_GAP_MS = 60 * 1000; // sekmeye dönüşte en fazla dakikada bir
const SNOOZE_MS = 10 * 60 * 1000; // "Sonra" denirse 10 dakika sonra tekrar hatırlat

const ASSET_RE = /\/assets\/index-[\w-]+\.js/;

const getRunningBundle = (): string | null => {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  for (const sc of scripts) {
    const m = sc.src.match(ASSET_RE);
    if (m) return m[0];
  }
  return null;
};

const fetchLatestBundle = async (): Promise<string | null> => {
  try {
    const res = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'text/html' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(ASSET_RE);
    return m ? m[0] : null;
  } catch {
    return null; // bağlantı yoksa sessizce geç
  }
};

export const UpdateAvailableBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const runningRef = useRef<string | null>(null);
  const lastCheckRef = useRef(0);
  const snoozeUntilRef = useRef(0);
  const updateFoundRef = useRef(false);

  useEffect(() => {
    runningRef.current = getRunningBundle();
    if (!runningRef.current) return; // geliştirme ortamı

    let cancelled = false;
    const check = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheckRef.current < MIN_GAP_MS) return;
      lastCheckRef.current = now;
      if (updateFoundRef.current) {
        if (now >= snoozeUntilRef.current && !cancelled) setVisible(true);
        return;
      }
      const latest = await fetchLatestBundle();
      if (cancelled || !latest || !runningRef.current) return;
      if (latest !== runningRef.current) {
        updateFoundRef.current = true;
        if (Date.now() >= snoozeUntilRef.current) setVisible(true);
      }
    };

    const first = window.setTimeout(() => check(true), 30 * 1000);
    const timer = window.setInterval(() => check(true), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onFocus = () => check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      id="update-available-banner"
      className="fixed z-[100] left-1/2 -translate-x-1/2 bottom-4 w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-indigo-400/40 bg-indigo-600 text-white shadow-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <RefreshCw className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-bold">Yeni sürüm yayınlandı</p>
          <p className="text-xs text-indigo-100">
            Sistemin doğru çalışması için sayfayı yenileyin. Yarım kalan bir formunuz varsa önce kaydedin.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 justify-end">
        <button
          type="button"
          onClick={() => {
            snoozeUntilRef.current = Date.now() + SNOOZE_MS;
            setVisible(false);
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-100 hover:bg-indigo-500 flex items-center gap-1 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Sonra
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-50 shadow-sm cursor-pointer"
        >
          Şimdi Yenile
        </button>
      </div>
    </div>
  );
};
