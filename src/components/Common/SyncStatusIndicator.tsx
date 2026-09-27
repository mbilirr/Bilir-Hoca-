import React, { useState, useEffect } from 'react';
import { RefreshCw, Smartphone, Laptop, CheckCircle2, Cloud, Zap } from 'lucide-react';
import { dataService } from '../../services/dataService';

export const SyncStatusIndicator: React.FC<{
  variant?: 'compact' | 'badge' | 'card';
  className?: string;
}> = ({ variant = 'badge', className = '' }) => {
  const [lastSync, setLastSync] = useState<Date>(() => dataService.getLastSyncTime());
  const [deviceId, setDeviceId] = useState<string>(() => dataService.getSessionDeviceId());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setLastSync(dataService.getLastSyncTime());
      setDeviceId(dataService.getSessionDeviceId());
      setJustUpdated(true);
      const timer = setTimeout(() => setJustUpdated(false), 1500);
      return () => clearTimeout(timer);
    });
    return () => unsub();
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await dataService.revalidateAndSyncAll(false);
      setLastSync(dataService.getLastSyncTime());
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const formattedTime = lastSync.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedDate = lastSync.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium ${className}`}
        title={`Cihaz ID: ${deviceId} • Son Senkronizasyon: ${formattedDate} ${formattedTime}`}
      >
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${
              justUpdated ? 'scale-150 duration-300' : 'duration-1000'
            }`}
          />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="truncate">Senk: {formattedTime}</span>
        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-300">
          {deviceId}
        </span>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={`p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs space-y-2 text-slate-300 shadow-sm ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cloud className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-white">Bulut Senkronizasyon Durumu</span>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
            title="Şimdi Senkronize Et"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px]">
          <div>
            <span className="text-slate-500 block">Son Senkronizasyon:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              {formattedDate} {formattedTime}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Bu Oturumun Cihaz/Tarayıcı Kimliği:</span>
            <span className="font-mono font-bold text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-900/50 inline-block">
              {deviceId}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Default 'badge' variant (in Navbar header)
  return (
    <div
      id="live-sync-monitor-badge"
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-slate-300 text-xs transition-all shadow-2xs ${
        justUpdated ? 'ring-2 ring-emerald-500/50 bg-emerald-950/20' : ''
      } ${className}`}
      title="Gerçek zamanlı çoklu cihaz senkronizasyonu aktif"
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${
            justUpdated ? 'scale-150 duration-300' : 'duration-1000'
          }`}
        />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-slate-400 hidden lg:inline">Son senk:</span>
        <span className="font-semibold text-emerald-400 whitespace-nowrap">{formattedTime}</span>
        <span className="text-slate-600 hidden sm:inline">•</span>
        <span className="font-mono font-bold text-indigo-300 bg-slate-900/90 px-1.5 py-0.2 rounded text-[10px] hidden sm:inline-block border border-slate-700/50">
          {deviceId}
        </span>
      </div>

      <button
        type="button"
        onClick={handleManualSync}
        disabled={isSyncing}
        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700/60 transition-colors cursor-pointer"
        title="Şimdi eşitle"
      >
        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
      </button>
    </div>
  );
};
