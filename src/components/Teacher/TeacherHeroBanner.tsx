import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  CalendarDays,
  Sparkles,
  GraduationCap,
  PlusCircle,
  CheckCircle2,
  Bookmark,
  Crown,
} from 'lucide-react';
import { Teacher, Etut, Homework, TeacherTabType } from '../../types';

interface TeacherHeroBannerProps {
  currentTeacher?: Teacher | null;
  etuts: Etut[];
  homeworks: Homework[];
  onNavigateTab: (tab: TeacherTabType) => void;
}

const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const WEEKDAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const TeacherHeroBanner: React.FC<TeacherHeroBannerProps> = ({
  currentTeacher,
  etuts,
  homeworks,
  onNavigateTab,
}) => {
  const today = useMemo(() => new Date(), []);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth(); // 0-11
  const todayDate = today.getDate();

  // Format today as YYYY-MM-DD
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Calendar View State
  const [viewYear, setViewYear] = useState<number>(todayYear);
  const [viewMonth, setViewMonth] = useState<number>(todayMonth);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleGoToToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDateStr(todayStr);
  };

  // Calendar Matrix Computation
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // 0 = Sunday, 1 = Monday ... convert Monday to 0
    const startDayIndex = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      hasEtut: boolean;
      hasHomework: boolean;
    }[] = [];

    // 1. Previous month trailing days
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        hasEtut: etuts.some((e) => e.date === dateStr),
        hasHomework: homeworks.some((h) => h.dueDate && h.dueDate.slice(0, 10) === dateStr),
      });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        hasEtut: etuts.some((e) => e.date === dateStr),
        hasHomework: homeworks.some((h) => h.dueDate && h.dueDate.slice(0, 10) === dateStr),
      });
    }

    // 3. Next month leading days to complete grid (multiples of 7)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        hasEtut: etuts.some((e) => e.date === dateStr),
        hasHomework: homeworks.some((h) => h.dueDate && h.dueDate.slice(0, 10) === dateStr),
      });
    }

    return cells;
  }, [viewYear, viewMonth, todayStr, selectedDateStr, etuts, homeworks]);

  // Events for the selected date
  const selectedDateEtuts = useMemo(
    () => etuts.filter((e) => e.date === selectedDateStr),
    [etuts, selectedDateStr]
  );

  const selectedDateHomeworks = useMemo(
    () => homeworks.filter((h) => h.dueDate && h.dueDate.slice(0, 10) === selectedDateStr),
    [homeworks, selectedDateStr]
  );

  // Formatted date string for selected date in Turkish
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDateStr) return '';
    const [y, m, d] = selectedDateStr.split('-');
    const monthIndex = parseInt(m, 10) - 1;
    const dateObj = new Date(parseInt(y, 10), monthIndex, parseInt(d, 10));
    const dayName = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][
      dateObj.getDay()
    ];
    return `${parseInt(d, 10)} ${TURKISH_MONTHS[monthIndex]} ${y}, ${dayName}`;
  }, [selectedDateStr]);

  const isSelectedToday = selectedDateStr === todayStr;

  return (
    <div
      className="bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 border border-slate-800/90 rounded-3xl shadow-xl overflow-hidden mb-6"
      id="teacher-hero-banner"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px]">
        {/* ================= SOL YARI: ÖĞRETMEN SAYFASINA UYGUN RESİM ================= */}
        <div className="lg:col-span-6 relative flex flex-col justify-between overflow-hidden bg-slate-950 group">
          {/* Arka Plan Resmi */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1200&auto=format&fit=crop&q=80"
              alt="Öğretmen Akademik Çalışma Alanı"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center transform group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            {/* Karartma ve Renk Geçiş Katmanları */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-900/40" />
            <div className="absolute inset-0 bg-indigo-950/20 mix-blend-multiply" />
          </div>

          {/* Üst Kısım Rozet ve Başlık */}
          <div className="relative z-10 p-5 sm:p-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-indigo-500/30 text-indigo-300 text-xs font-bold shadow-lg">
              <GraduationCap className="w-4 h-4 text-indigo-400" />
              <span>Akademik Öğretmen Portalı</span>
            </div>

            <div className="mt-4 flex items-center space-x-3.5">
              {/* Öğretmen Profil Resmi veya Emojisi */}
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 ring-2 ring-indigo-400/80 shadow-lg shadow-indigo-950/70 flex items-center justify-center overflow-hidden shrink-0">
                {currentTeacher?.avatar ? (
                  currentTeacher.avatar.startsWith('http') || currentTeacher.avatar.startsWith('data:') ? (
                    <img
                      src={currentTeacher.avatar}
                      alt={currentTeacher.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl sm:text-3xl select-none">
                      {currentTeacher.avatar}
                    </span>
                  )
                ) : (
                  <span className="font-black text-sm sm:text-base text-white tracking-wider">
                    {currentTeacher?.name
                      ? currentTeacher.name
                          .split(' ')
                          .filter(Boolean)
                          .map((n) => n[0] || '')
                          .join('')
                          .slice(0, 2)
                          .toUpperCase() || 'ÖĞ'
                      : 'ÖĞ'}
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md">
                  Hoş Geldiniz,{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-indigo-200">
                    {currentTeacher?.name || 'Öğretmenimiz'}
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5 drop-shadow">
                  {currentTeacher?.branch
                    ? currentTeacher.branch.includes('Öğretmen')
                      ? currentTeacher.branch
                      : `${currentTeacher.branch} Öğretmeni`
                    : 'Fen Bilgisi Öğretmeni'}{' '}
                  • 2026-2027 Akademik Takvim
                </p>
              </div>
            </div>
          </div>

          {/* Alt Kısım: İlham Verici Söz ve Hızlı İstatistik Rozetleri */}
          <div className="relative z-10 p-5 sm:p-6 pt-0">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/90 rounded-2xl p-3.5 shadow-lg">
              <div className="flex items-start space-x-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-200 italic font-medium leading-relaxed">
                    &ldquo;Hiç kimse başarı merdivenlerini elleri cebinde tırmanmamıştır.&rdquo;
                  </p>
                  <p className="text-[11px] text-amber-300/90 font-bold text-right mt-1">
                    – J. Kethoor
                  </p>
                </div>
              </div>

              {/* Hızlı Kısayol Butonları */}
              <div className={`grid ${currentTeacher?.isAdmin ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-semibold`}>
                <button
                  type="button"
                  onClick={() => onNavigateTab('etuts')}
                  className="flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-colors"
                >
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Etütler ({etuts.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('homework')}
                  className="flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Ödevler ({homeworks.length})</span>
                </button>
                {currentTeacher?.isAdmin && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('user_management')}
                    className="flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate font-bold">Kullanıcı & RBAC</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================= SAĞ YARI: GÜNCEL AYI GÖSTEREN AJANDA ================= */}
        <div className="lg:col-span-6 p-4 sm:p-5 lg:p-6 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-950/40">
          <div>
            {/* Ajanda Başlığı ve Ay Gezinme */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-inner">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                    {TURKISH_MONTHS[viewMonth]} {viewYear}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">Akademik Aylık Ajanda • 2026-2027</p>
                </div>
              </div>

              {/* Gezinme Düğmeleri */}
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={handleGoToToday}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                    viewYear === todayYear && viewMonth === todayMonth
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                  title="Bugüne Dön"
                >
                  Bugün
                </button>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  title="Önceki Ay"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  title="Sonraki Ay"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Haftanın Günleri Başlığı */}
            <div className="grid grid-cols-7 gap-1 mt-3 mb-1 text-center">
              {WEEKDAY_NAMES.map((wDay, idx) => (
                <div
                  key={wDay}
                  className={`text-[11px] font-bold py-1 ${
                    idx >= 5 ? 'text-amber-400/80' : 'text-slate-400'
                  }`}
                >
                  {wDay}
                </div>
              ))}
            </div>

            {/* Ayın Günleri Matrisi */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell) => {
                const hasEvents = cell.hasEtut || cell.hasHomework;

                let cellBgClass = 'text-slate-300 hover:bg-slate-800/70';
                if (!cell.isCurrentMonth) {
                  cellBgClass = 'text-slate-600 hover:bg-slate-800/30 opacity-40';
                }

                if (cell.isSelected) {
                  cellBgClass = 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-400 shadow-md';
                } else if (cell.isToday) {
                  cellBgClass =
                    'bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/50 hover:bg-amber-500/30';
                }

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    className={`relative h-9 sm:h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${cellBgClass}`}
                  >
                    <span className="text-xs">{cell.dayNumber}</span>

                    {/* Etkinlik Noktaları (Etüt & Ödev) */}
                    {hasEvents && (
                      <div className="flex items-center space-x-0.5 mt-0.5">
                        {cell.hasEtut && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-sm"
                            title="Etüt Planı Var"
                          />
                        )}
                        {cell.hasHomework && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm"
                            title="Ödev Teslimi Var"
                          />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ================= SEÇİLİ GÜNÜN PROGRAMI / AJANDA DETAYI ================= */}
          <div className="mt-3.5 pt-3 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{formattedSelectedDate}</span>
                {isSelectedToday && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 ml-1">
                    Bugün
                  </span>
                )}
              </span>

              {/* Açıklama Rozetleri */}
              <div className="flex items-center space-x-2 text-[10px]">
                <span className="flex items-center space-x-1 text-cyan-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Etüt</span>
                </span>
                <span className="flex items-center space-x-1 text-amber-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Ödev</span>
                </span>
              </div>
            </div>

            {/* Günün Etkinlikleri Listesi */}
            <div className="space-y-1.5 max-h-[105px] overflow-y-auto pr-1 text-xs">
              {selectedDateEtuts.length === 0 && selectedDateHomeworks.length === 0 ? (
                <div className="bg-slate-900/60 rounded-xl p-2 text-center text-slate-400 border border-slate-800/60">
                  <span>Bu tarihte planlanmış etüt veya ödev teslimi bulunmuyor.</span>
                </div>
              ) : (
                <>
                  {selectedDateEtuts.map((etut) => (
                    <div
                      key={etut.id}
                      onClick={() => onNavigateTab('etuts')}
                      className="flex items-center justify-between p-2 rounded-xl bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-500/30 text-cyan-200 cursor-pointer transition-colors"
                      title="Etüt detayını aç"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-bold text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded text-[11px]">
                          {etut.time}
                        </span>
                        <span className="font-semibold truncate">
                          {etut.subject}: {etut.topic}
                        </span>
                      </div>
                      <span className="text-[11px] text-cyan-400 font-medium shrink-0 ml-2">
                        {etut.duration} dk
                      </span>
                    </div>
                  ))}

                  {selectedDateHomeworks.map((hw) => (
                    <div
                      key={hw.id}
                      onClick={() => onNavigateTab('homework')}
                      className="flex items-center justify-between p-2 rounded-xl bg-amber-950/30 hover:bg-amber-900/40 border border-amber-500/30 text-amber-200 cursor-pointer transition-colors"
                      title="Ödev detayını aç"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded text-[11px]">
                          Ödev Teslim
                        </span>
                        <span className="font-semibold truncate">
                          {hw.subject}: {hw.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-amber-400 font-medium shrink-0 ml-2">
                        {hw.dueDate.includes('T') ? hw.dueDate.slice(11, 16) : 'Gün Sonu'}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
