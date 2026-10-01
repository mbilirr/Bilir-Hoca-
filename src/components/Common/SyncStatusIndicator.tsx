import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { dataService } from '../../services/dataService';

export const SyncStatusIndicator: React.FC<{
  variant?: 'compact' | 'badge' | 'card' | string;
  className?: string;
}> = ({ className = '' }) => {
  const [lastSync, setLastSync] = useState<Date>(() => dataService.getLastSyncTime());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [justUpdated, setJustUpdated] = useState<boolean>(false);
  const [health, setHealth] = useState<'live' | 'fallback' | 'offline'>(() => dataService.getRealtimeHealth());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setLastSync(dataService.getLastSyncTime());
      setHealth(dataService.getRealtimeHealth());
      setJustUpdated(true);
      const timer = setTimeout(() => setJustUpdated(false), 1200);
      return () => clearTimeout(timer);
    });
    return () => unsub();
  }, []);

  const handleManualRefresh = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // 13 veri modülünü kapsayan tam doğrulama ve senkronizasyon
      await dataService.revalidateAndSyncAll(false);
      setLastSync(dataService.getLastSyncTime());
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2500);
    } catch (err) {
      console.warn('[SyncStatusIndicator] Manuel senkronizasyon tazeleme uyarısı:', err);
    } finally {
      setTimeout(() => setIsSyncing(false), 300);
    }
  };

  const formattedTime = lastSync.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      id="unified-sync-status-indicator"
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 shadow-sm transition-all ${
        justUpdated ? 'ring-1 ring-emerald-500/50 bg-slate-900' : ''
      } ${className}`}
      title={
        health === 'live'
          ? 'Canlı bağlantı açık: diğer cihazlardaki değişiklikler anında gelir.'
          : health === 'offline'
          ? 'İnternet bağlantısı yok. Bağlantı gelince veriler otomatik yenilenecek.'
          : 'Canlı bağlantı kurulamadı: veriler 30 saniyede bir otomatik kontrol ediliyor.'
      }
      data-sync-health={health}
    >
      {/* Bağlantı durumu: yeşil = canlı, sarı = aralıklı kontrol, kırmızı = internet yok */}
      <span className="relative flex h-2 w-2 shrink-0" aria-label={health === 'live' ? 'Canlı' : health === 'offline' ? 'Çevrimdışı' : 'Aralıklı kontrol'}>
        {health === 'live' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 duration-1000" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            health === 'live' ? 'bg-emerald-500' : health === 'offline' ? 'bg-rose-500' : 'bg-amber-400'
          }`}
        />
      </span>

      {/* Senkronizasyon zamanı */}
      <span className="text-[11px] font-semibold text-emerald-400 font-mono whitespace-nowrap">
        {formattedTime}
      </span>

      <span className="text-slate-700 select-none text-xs">|</span>

      {/* Tek ve Güvenilir 'Şimdi Yenile' Butonu */}
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isSyncing}
        className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 active:bg-slate-700 text-slate-200 hover:text-white transition-all text-[11px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
        title="Tüm verileri sunucudan anında manuel doğrula ve tazele (Otomatik eşitleme zaten arka planda çalışmaktadır)"
      >
        <RefreshCw
          className={`w-3 h-3 text-cyan-400 ${
            isSyncing
              ? 'animate-spin'
              : 'group-hover:rotate-180 transition-transform duration-500'
          }`}
        />
        <span className="whitespace-nowrap">
          {isSyncing ? 'Yenileniyor...' : isSuccess ? '✓ Güncel' : 'Şimdi Yenile'}
        </span>
      </button>
    </div>
  );
};
