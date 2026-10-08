import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { Etut } from '../../types';
import { etutEndTime, isEtutAttendanceMissing } from '../../lib/etutTiming';

// Aşama 24: Yöneticiye (genel yönetici ve kurum yöneticisi) — etüdü bitmiş ama yoklaması alınmamış etütler.
// Liste, yöneticinin görebildiği etütlerden canlı hesaplanır; yoklama alınınca etüt kendiliğinden listeden düşer.
const LOOKBACK_DAYS = 14; // çok eski etütler uyarıyı kalabalıklaştırmasın
const PREVIEW_COUNT = 5;

const shortDate = (e: Etut): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e.date || ''));
  const d = m ? `${m[3]}.${m[2]}` : e.date;
  return `${d}${e.time ? ` ${e.time}` : ''}`;
};

export const UnattendedEtutBanner: React.FC<{ onOpenEtuts: () => void }> = ({ onOpenEtuts }) => {
  const [etuts, setEtuts] = useState<Etut[]>(() => dataService.getEtuts());
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = dataService.subscribe(() => setEtuts(dataService.getEtuts()));
    // Etüt saatleri geçtikçe listenin güncellenmesi için dakikada bir yeniden hesaplanır
    const timer = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  const missing = useMemo(() => {
    const now = new Date();
    const cutoff = now.getTime() - LOOKBACK_DAYS * 86400000;
    return etuts
      .filter((e) => {
        if (!e || String(e.id).startsWith('__')) return false;
        const end = etutEndTime(e);
        return !!end && end.getTime() >= cutoff && isEtutAttendanceMissing(e, now);
      })
      .sort((a, b) => (etutEndTime(b)?.getTime() || 0) - (etutEndTime(a)?.getTime() || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etuts, tick]);

  if (dismissed || missing.length === 0) return null;
  const shown = open ? missing.slice(0, 30) : missing.slice(0, PREVIEW_COUNT);

  return (
    <div
      id="unattended-etut-banner"
      role="status"
      className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-100 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-300 shrink-0" />
          <span>
            <strong>{missing.length}</strong> etüt bitti ancak yoklaması alınmadı.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenEtuts}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
          >
            Etütlere git
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Uyarıyı kapat"
            className="p-1.5 rounded-lg hover:bg-rose-500/20 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <ul className="text-xs space-y-1">
        {shown.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-x-2">
            <span className="font-semibold">{shortDate(e)}</span>
            <span>
              {e.subject}
              {e.topic ? ` – ${e.topic}` : ''}
            </span>
            {e.teacherName && <span className="opacity-80">· {e.teacherName}</span>}
          </li>
        ))}
      </ul>
      {missing.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold inline-flex items-center gap-1 cursor-pointer hover:underline"
        >
          {open ? (
            <>
              Daha az göster <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Tümünü göster ({missing.length}) <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
};
