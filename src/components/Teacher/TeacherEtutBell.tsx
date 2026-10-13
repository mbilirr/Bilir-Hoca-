import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Calendar,
  Clock,
  MapPin,
  Users,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import { Etut, Student } from '../../types';

interface TeacherEtutBellProps {
  etuts: Etut[];
  students: Student[];
  onOpenEtutsTab: (selectedEtutId?: string) => void;
}

export const TeacherEtutBell: React.FC<TeacherEtutBellProps> = ({
  etuts,
  students,
  onOpenEtutsTab,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Aşama 32: açılır liste sayfanın en üstünde (portal) çizilir; hiçbir kaydırma kutusu onu kesemez
  const [popPos, setPopPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const placePopover = () => {
    const btn = containerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(384, window.innerWidth - 16);
    // Zilin sağ kenarına hizala; ekrandan taşacaksa içeri al
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setPopPos({ top: r.bottom + 10, left, width });
  };

  useLayoutEffect(() => {
    if (isOpen) placePopover();
  }, [isOpen]);

  // Dışarı tıklayınca, Esc'e basınca, sayfa kayınca / boyut değişince kapan
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (containerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const onMove = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return; // liste içinde kaydırma
      placePopover();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [isOpen]);

  // Aşama 32: tarihler YEREL saatle (toISOString UTC verdiği için gece 00:00–03:00 arası bir önceki günü sayıyordu)
  const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const todayStr = localYmd(now);
  const maxUpcomingStr = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

  // Sort upcoming etuts by date and time
  const safeEtuts = Array.isArray(etuts) ? etuts : [];
  const upcomingEtuts = safeEtuts
    .filter((e) => e && e.date && e.date >= todayStr && e.date <= maxUpcomingStr)
    .sort((a, b) => {
      const dateA = a?.date || '';
      const dateB = b?.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a?.time || '').localeCompare(b?.time || '');
    });

  const todayEtuts = upcomingEtuts.filter((e) => e.date === todayStr);
  const futureEtuts = upcomingEtuts.filter((e) => e.date > todayStr);

  const hasTodayEtut = todayEtuts.length > 0;
  const totalCount = upcomingEtuts.length;

  // Helper for student names in etut
  const getAssignedStudentsLabel = (assignedStudentIds: 'all' | string[]) => {
    if (assignedStudentIds === 'all') {
      return 'Tüm Sınıf / Grup';
    }
    if (assignedStudentIds.length === 1) {
      const s = students.find((std) => std.id === assignedStudentIds[0]);
      return s ? s.name : '1 Öğrenci';
    }
    const names = assignedStudentIds
      .map((id) => students.find((s) => s.id === id)?.name?.split(' ')[0])
      .filter(Boolean);
    if (names.length > 2) {
      return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
    }
    return names.join(', ') || `${assignedStudentIds.length} Öğrenci`;
  };

  const formatEtutDate = (dateStr: string) => {
    if (dateStr === todayStr) return 'Bugün';
    const tomorrow = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    if (dateStr === tomorrow) return 'Yarın';

    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  const handleSelectEtut = (etutId: string) => {
    setIsOpen(false);
    onOpenEtutsTab(etutId);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Etüt bildirimleri"
        className={`relative p-2.5 rounded-xl border transition-all flex items-center justify-center ${
          isOpen
            ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-500/30'
            : hasTodayEtut
            ? 'bg-surface-2/90 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-surface-2 hover:text-amber-700 dark:hover:text-amber-200'
            : 'bg-surface-2/80 text-fg-2 border-line hover:bg-surface-2 hover:text-fg'
        }`}
        title={
          hasTodayEtut
            ? `Bugün ${todayEtuts.length} etüt var — listeyi açmak için tıklayın`
            : totalCount > 0
            ? `Önümüzdeki 7 günde ${totalCount} etüt — listeyi açmak için tıklayın`
            : 'Önümüzdeki 7 günde etüt yok'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="w-5 h-5" />

        {/* Aşama 32: rozet yalnızca BUGÜNKÜ etüt sayısını gösterir (eskiden 7 günün toplamıydı ve anlaşılmıyordu) */}
        {hasTodayEtut && (
          <span className="absolute -top-2 -right-2 flex min-w-[20px] h-5" title={`Bugün ${todayEtuts.length} etüt`}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60" />
            <span className="relative inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold ring-2 ring-surface shadow-md">
              {todayEtuts.length}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && popPos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Yaklaşan etütler"
          style={{ position: 'fixed', top: popPos.top, left: popPos.left, width: popPos.width }}
          className="bg-surface border border-line rounded-2xl shadow-2xl z-[70] overflow-hidden text-fg animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-canvas/80 border-b border-line flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-fg tracking-wide">
                  Etüt & Birebir Takvimi
                </h4>
                <p className="text-[10px] text-muted">
                  {hasTodayEtut
                    ? `Bugün ${todayEtuts.length} etüt, toplam ${totalCount} yaklaşan oturum`
                    : `${totalCount} yaklaşan etüt oturumu`}
                </p>
              </div>
            </div>

            {hasTodayEtut && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 flex items-center space-x-1 animate-pulse">
                <AlertCircle className="w-3 h-3" />
                <span>Bugün Etüt Var!</span>
              </span>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-line p-1.5">
            {upcomingEtuts.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <Calendar className="w-8 h-8 text-subtle mx-auto mb-2" />
                <p className="text-xs font-medium text-fg-2">
                  Önümüzdeki 7 gün içinde planlanmış etüt bulunmuyor.
                </p>
              </div>
            ) : (
              upcomingEtuts.map((etut) => {
                const isToday = etut.date === todayStr;
                return (
                  <div
                    key={etut.id}
                    onClick={() => handleSelectEtut(etut.id)}
                    className={`p-3 rounded-xl transition-all cursor-pointer hover:bg-surface-2/70 group ${
                      isToday
                        ? 'bg-amber-500/10 border border-amber-500/20 my-1'
                        : 'hover:bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Tags */}
                        <div className="flex items-center space-x-1.5 mb-1 flex-wrap gap-y-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              isToday
                                ? 'bg-amber-500 text-slate-950 font-extrabold'
                                : 'bg-surface-2 text-indigo-600 dark:text-indigo-300 border border-line'
                            }`}
                          >
                            {formatEtutDate(etut.date)} • {etut.time}
                          </span>

                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                            {etut.subject}
                          </span>

                          <span className="text-[10px] text-muted">
                            ({etut.duration} dk)
                          </span>
                        </div>

                        {/* Topic */}
                        <h5 className="text-xs font-semibold text-fg group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors truncate">
                          {etut.topic}
                        </h5>

                        {/* Location and Students Info */}
                        <div className="flex items-center space-x-3 mt-1.5 text-[11px] text-muted">
                          <span className="flex items-center space-x-1 truncate">
                            <Users className="w-3 h-3 text-muted flex-shrink-0" />
                            <span className="truncate">
                              {getAssignedStudentsLabel(etut.assignedStudentIds)}
                            </span>
                          </span>

                          {etut.location && (
                            <span className="flex items-center space-x-1 truncate">
                              <MapPin className="w-3 h-3 text-muted flex-shrink-0" />
                              <span className="truncate">{etut.location}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Action */}
          <div className="p-2.5 bg-canvas/90 border-t border-line flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenEtutsTab();
              }}
              className="w-full py-2 px-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-all flex items-center justify-center space-x-1.5 border border-indigo-500/20"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Tüm Etüt & Birebir Yönetimini Aç</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
