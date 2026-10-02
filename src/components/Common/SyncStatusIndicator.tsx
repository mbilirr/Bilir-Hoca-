import React, { useState, useEffect } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { dataService } from '../../services/dataService';

type Health = 'live' | 'fallback' | 'offline';

const HEALTH_TEXT: Record<Health, { short: string; long: string }> = {
  live: { short: 'Canlı', long: 'Canlı bağlantı açık: diğer cihazlardaki değişiklikler anında gelir.' },
  fallback: { short: 'Otomatik kontrol', long: 'Canlı bağlantı kurulamadı: veriler 30 saniyede bir otomatik kontrol ediliyor.' },
  offline: { short: 'Çevrimdışı', long: 'İnternet bağlantısı yok. Bağlantı gelince veriler otomatik yenilenecek.' },
};

// Bağlantı noktası: yeşil = canlı, sarı = aralıklı kontrol, kırmızı = internet yok
const HealthDot: React.FC<{ health: Health }> = ({ health }) => (
  <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
    {health === 'live' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />}
    <span
      className={`relative inline-flex rounded-full h-2 w-2 ${
        health === 'live' ? 'bg-emerald-500' : health === 'offline' ? 'bg-rose-500' : 'bg-amber-400'
      }`}
    />
  </span>
);

export const SyncStatusIndicator: React.FC<{
  variant?: 'badge' | 'card' | 'compact' | string;
  className?: string;
}> = ({ variant = 'badge', className = '' }) => {
  const [lastSync, setLastSync] = useState<Date>(() => dataService.getLastSyncTime());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [health, setHealth] = useState<Health>(() => dataService.getRealtimeHealth());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setLastSync(dataService.getLastSyncTime());
      setHealth(dataService.getRealtimeHealth());
    });
    return () => unsub();
  }, []);

  const handleManualRefresh = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await dataService.revalidateAndSyncAll(false);
      setLastSync(dataService.getLastSyncTime());
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2500);
    } catch (err) {
      console.warn('[SyncStatusIndicator] Manuel yenileme uyarısı:', err);
    } finally {
      setTimeout(() => setIsSyncing(false), 300);
    }
  };

  const time = lastSync.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const label = HEALTH_TEXT[health];

  // Menü içindeki ayrıntılı görünüm
  if (variant === 'card') {
    return (
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface-2 ${className}`}
        title={label.long}
        data-sync-health={health}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <HealthDot health={health} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg">{health === 'offline' ? 'Çevrimdışı' : 'Veriler güncel'}</p>
            <p className="text-[11px] text-muted">Son eşitleme {time}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isSyncing}
          className="ui-btn ui-btn-secondary ui-btn-sm"
          title="Tüm verileri şimdi sunucudan yenile"
        >
          {isSuccess ? <Check className="w-3.5 h-3.5 text-success-fg" /> : <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
          {isSyncing ? 'Yenileniyor' : isSuccess ? 'Güncel' : 'Yenile'}
        </button>
      </div>
    );
  }

  // Üst menüdeki küçük rozet
  return (
    <div
      id="unified-sync-status-indicator"
      className={`inline-flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-full border border-line bg-surface text-xs text-fg-2 ${className}`}
      title={`${label.long} Son eşitleme: ${time}`}
      data-sync-health={health}
    >
      <HealthDot health={health} />
      <span className="hidden lg:inline font-medium whitespace-nowrap">{label.short}</span>
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isSyncing}
        aria-label="Verileri şimdi yenile"
        title={`Verileri şimdi yenile (son eşitleme ${time})`}
        className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        {isSuccess ? (
          <Check className="w-3.5 h-3.5 text-success-fg" />
        ) : (
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        )}
      </button>
    </div>
  );
};
