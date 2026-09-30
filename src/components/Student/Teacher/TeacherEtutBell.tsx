import React, { useState, useRef, useEffect } from 'react';
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

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Today string YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter today and upcoming etuts (up to 7 days ahead)
  const now = new Date();
  const maxUpcomingDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const maxUpcomingStr = maxUpcomingDate.toISOString().slice(0, 10);

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
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
            ? 'bg-slate-800/90 text-amber-300 border-amber-500/40 hover:bg-slate-800 hover:text-amber-200'
            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white'
        }`}
        title={
          hasTodayEtut
            ? `Bugün ${todayEtuts.length} adet planlı etütünüz var!`
            : totalCount > 0
            ? `${totalCount} yaklaşan etüt planlandı`
            : 'Yaklaşan etüt bildirimi yok'
        }
      >
        <Bell className="w-4 h-4" />

        {/* Pulse beacon if today has an etut */}
        {hasTodayEtut && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
          </span>
        )}

        {/* Badge counter */}
        {totalCount > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white shadow-md ${
              hasTodayEtut ? 'bg-rose-500 ring-2 ring-slate-900' : 'bg-indigo-600 ring-2 ring-slate-900'
            }`}
          >
            {totalCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl z-50 overflow-hidden text-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-4 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide">
                  Etüt & Birebir Takvimi
                </h4>
                <p className="text-[10px] text-slate-400">
                  {hasTodayEtut
                    ? `Bugün ${todayEtuts.length} etüt, toplam ${totalCount} yaklaşan oturum`
                    : `${totalCount} yaklaşan etüt oturumu`}
                </p>
              </div>
            </div>

            {hasTodayEtut && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center space-x-1 animate-pulse">
                <AlertCircle className="w-3 h-3" />
                <span>Bugün Etüt Var!</span>
              </span>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80 p-1.5">
            {upcomingEtuts.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-300">
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
                    className={`p-3 rounded-xl transition-all cursor-pointer hover:bg-slate-800/70 group ${
                      isToday
                        ? 'bg-amber-500/10 border border-amber-500/20 my-1'
                        : 'hover:bg-slate-800/50'
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
                                : 'bg-slate-800 text-indigo-300 border border-slate-700'
                            }`}
                          >
                            {formatEtutDate(etut.date)} • {etut.time}
                          </span>

                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {etut.subject}
                          </span>

                          <span className="text-[10px] text-slate-400">
                            ({etut.duration} dk)
                          </span>
                        </div>

                        {/* Topic */}
                        <h5 className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors truncate">
                          {etut.topic}
                        </h5>

                        {/* Location and Students Info */}
                        <div className="flex items-center space-x-3 mt-1.5 text-[11px] text-slate-400">
                          <span className="flex items-center space-x-1 truncate">
                            <Users className="w-3 h-3 text-slate-500 flex-shrink-0" />
                            <span className="truncate">
                              {getAssignedStudentsLabel(etut.assignedStudentIds)}
                            </span>
                          </span>

                          {etut.location && (
                            <span className="flex items-center space-x-1 truncate">
                              <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
                              <span className="truncate">{etut.location}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Action */}
          <div className="p-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenEtutsTab();
              }}
              className="w-full py-2 px-3 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 rounded-xl transition-all flex items-center justify-center space-x-1.5 border border-indigo-500/20"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Tüm Etüt & Birebir Yönetimini Aç</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
