import React, { useEffect, useState } from 'react';
import { DatabaseBackup, X } from 'lucide-react';
import { getLastBackupDate, BACKUP_REMINDER_DAYS } from '../../services/maintenanceService';

// Yöneticiye: son yedek 7 günden eskiyse (veya hiç yoksa) hatırlatma bandı
export const AdminBackupReminder: React.FC<{ onOpenBackup: () => void }> = ({ onOpenBackup }) => {
  const [days, setDays] = useState<number | null | undefined>(undefined); // null = hiç yedek yok
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getLastBackupDate()
        .then((d) => {
          if (cancelled) return;
          if (d === 'unavailable') setDays(undefined); // tablo kurulmamışsa sessiz kal
          else if (d === null) setDays(null);
          else setDays(Math.floor((Date.now() - d.getTime()) / 86400000));
        })
        .catch(() => {});
    check();
    window.addEventListener('app-backup-done', check);
    return () => {
      cancelled = true;
      window.removeEventListener('app-backup-done', check);
    };
  }, []);

  if (dismissed || days === undefined || (days !== null && days < BACKUP_REMINDER_DAYS)) return null;

  return (
    <div
      id="admin-backup-reminder"
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-700 dark:text-emerald-100"
    >
      <div className="flex items-center gap-2.5 text-sm">
        <DatabaseBackup className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />
        <span>
          {days === null ? 'Henüz hiç veri yedeği alınmadı.' : `Son veri yedeği ${days} gün önce alındı.`} Haftada bir yedek
          almanız önerilir.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenBackup}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
        >
          Yedek Al
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Hatırlatmayı kapat"
          className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/20 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
