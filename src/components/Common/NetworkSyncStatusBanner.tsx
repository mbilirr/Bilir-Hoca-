import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, CheckCircle2, RefreshCw } from 'lucide-react';
import { dataService } from '../../services/dataService';

export const NetworkSyncStatusBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showOnlineToast, setShowOnlineToast] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOnlineToast(true);
      dataService.reconnectAllRealtime();
      dataService.revalidateAndSyncAll(false);

      const timer = setTimeout(() => {
        setShowOnlineToast(false);
      }, 4500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOnlineToast(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Offline banner
  if (!isOnline) {
    return (
      <div
        id="offline-sync-alert-banner"
        className="fixed top-0 inset-x-0 z-50 bg-amber-500 dark:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm py-2 px-4 shadow-lg flex items-center justify-center space-x-2 animate-in slide-in-from-top duration-300 border-b border-amber-600 dark:border-amber-700"
      >
        <WifiOff className="w-4 h-4 text-slate-950 animate-pulse shrink-0" />
        <span>Bağlantı yok, değişiklikler cihazınızda bekletiliyor</span>
        <span className="text-[11px] font-normal bg-amber-600/30 dark:bg-amber-700/40 px-2 py-0.5 rounded-full ml-2 hidden sm:inline-block">
          Bağlantı geldiğinde otomatik senkronize edilecektir
        </span>
      </div>
    );
  }

  // Reconnection success toast
  if (showOnlineToast) {
    return (
      <div
        id="online-sync-success-toast"
        className="fixed top-3 right-3 sm:right-6 z-50 bg-emerald-600 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-xl flex items-center space-x-2.5 animate-in slide-in-from-top-3 duration-300 border border-emerald-500"
      >
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-xs font-black">Senkronize edildi</div>
          <div className="text-[11px] font-normal text-emerald-100">
            İnternet bağlantısı sağlandı, bulut verileri güncellendi.
          </div>
        </div>
      </div>
    );
  }

  return null;
};
