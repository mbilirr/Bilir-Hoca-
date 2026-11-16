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
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-success/10 border border-success/40 text-success-fg"
    >
      <div className="flex items-center gap-2.5 text-sm">
        <DatabaseBackup className="w-4 h-4 text-success-fg shrink-0" />
        <span>
          {days === null ? 'Henüz hiç veri yedeği alınmadı.' : `Son veri yedeği ${days} gün önce alındı.`} Haftada bir yedek
          almanız önerilir.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenBackup}
          className="ui-btn ui-btn-sm bg-success text-slate-950 hover:bg-success/40 min-w-24"
        >
          Yedek Al
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Hatırlatmayı kapat"
          className="ui-btn ui-btn-ghost ui-btn-icon shrink-0 text-success-fg hover:bg-success/20"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
