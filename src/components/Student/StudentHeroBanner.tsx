import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  CalendarDays,
  Bookmark,
  Megaphone,
  StickyNote,
  Target,
  Award,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { Student, Etut, Homework, HomeworkSubmission, GradeRecord, StudentMessage } from '../../types';
import { dataService } from '../../services/dataService';
import { homeworkStateFor } from './StudentHomeUtils';
import { buildStudentQuestionSummary } from '../../utils/studentQuestionSummary';
import { useLiveNow } from '../../lib/useLiveNow';
import { useDataVersion } from '../../lib/useDataVersion';

export type StudentTabType = 'home' | 'homework' | 'etuts' | 'grades' | 'messages' | 'questions';

interface StudentHeroBannerProps {
  student: Student;
  etuts: Etut[];
  homeworks: Homework[];
  submissions?: HomeworkSubmission[];
  /** Aşama 25: "Duyurular" duvarında son notları göstermek için */
  grades?: GradeRecord[];
  /** Aşama 28: öğretmenin gönderdiği duyuru ve notlar */
  announcements?: StudentMessage[];
  onNavigateTab: (tab: StudentTabType) => void;
  onOpenAvatarModal: () => void;
  onOpenProfileModal?: () => void;
  onOpenPasswordModal?: () => void;
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

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Son kaç günün notları duyuru olarak gösterilsin
const GRADE_DAYS = 7;
// Öğretmenin duyuru / notu kaç gün boyunca ana sayfada kalsın
const TEACHER_ANNOUNCEMENT_DAYS = 14;

type DuyuruKind = 'etut' | 'odev' | 'yeni_odev' | 'hedef' | 'not' | 'duyuru' | 'ogretmen_notu';

interface Duyuru {
  id: string;
  kind: DuyuruKind;
  title: string;
  detail?: string;
  tab: StudentTabType;
  /** Öğretmenin yazdığı uzun metin: tıklayınca sayfa değiştirmek yerine altında açılır */
  body?: string;
  by?: string;
  at?: string;
}

const KIND_STYLE: Record<DuyuruKind, { icon: React.ComponentType<{ className?: string }>; box: string; label: string }> = {
  etut: { icon: Clock, box: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', label: 'Etüt' },
  odev: { icon: BookOpen, box: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', label: 'Ödev' },
  yeni_odev: { icon: BookOpen, box: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', label: 'Yeni ödev' },
  hedef: { icon: Target, box: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', label: 'Soru hedefi' },
  not: { icon: Award, box: 'bg-purple-500/15 text-purple-700 dark:text-purple-300', label: 'Not' },
  duyuru: { icon: Megaphone, box: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', label: 'Öğretmen duyurusu' },
  ogretmen_notu: { icon: StickyNote, box: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300', label: 'Öğretmen notu' },
};

export const StudentHeroBanner: React.FC<StudentHeroBannerProps> = ({
  student,
  etuts,
  homeworks,
  submissions,
  grades,
  announcements,
  onNavigateTab,
  onOpenAvatarModal,
}) => {
  const [openDuyuruId, setOpenDuyuruId] = useState<string | null>(null);
  // Canlı tarih: gece yarısı geçince / sekmeye dönünce "bugün" kendiliğinden güncellenir.
  const today = useLiveNow();
  // Veri (soru kaydı, ödev, etüt, mesaj...) değişince bu duvar da anında yenilenir.
  const dataVersion = useDataVersion();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth(); // 0-11
  const todayStr = useMemo(() => ymdOf(today), [today]);
  const tomorrowStr = useMemo(() => ymdOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)), [today]);

  // Calendar View State
  const [viewYear, setViewYear] = useState<number>(todayYear);
  const [viewMonth, setViewMonth] = useState<number>(todayMonth);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

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
    const startDayIndex = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      homeworkList: Homework[];
      etutList: Etut[];
    }[] = [];

    for (let i = startDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${pad2(prevM + 1)}-${pad2(dayNum)}`;
      cells.push({ dayNumber: dayNum, dateStr, isCurrentMonth: false, isToday: dateStr === todayStr, homeworkList: [], etutList: [] });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
      cells.push({
        dayNumber: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        homeworkList: homeworks.filter((hw) => hw.dueDate && hw.dueDate.slice(0, 10) === dateStr),
        etutList: etuts.filter((et) => et.date === dateStr),
      });
    }

    const remaining = 42 - cells.length;
    if (remaining < 7) {
      for (let day = 1; day <= remaining; day++) {
        const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
        const dateStr = `${nextY}-${pad2(nextM + 1)}-${pad2(day)}`;
        cells.push({ dayNumber: day, dateStr, isCurrentMonth: false, isToday: dateStr === todayStr, homeworkList: [], etutList: [] });
      }
    }

    return cells;
  }, [viewYear, viewMonth, todayStr, homeworks, etuts]);

  const selectedDetails = useMemo(() => {
    const selectedHws = homeworks.filter((h) => h.dueDate && h.dueDate.slice(0, 10) === selectedDateStr);
    const selectedEtuts = etuts.filter((e) => e.date === selectedDateStr);
    return {
      homeworks: selectedHws,
      etuts: selectedEtuts,
      hasEvents: selectedHws.length > 0 || selectedEtuts.length > 0,
    };
  }, [homeworks, etuts, selectedDateStr]);

  const formatSelectedDateTurkish = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const monthName = TURKISH_MONTHS[parseInt(m, 10) - 1] || '';
    return `${parseInt(d, 10)} ${monthName} ${y}${dateStr === todayStr ? ' (Bugün)' : ''}`;
  };

  // ===========================================================================
  // DUYURULAR: o günün etüdü, ödevi, soru hedefi ve öğrencinin yeni notları
  // ===========================================================================
  const activeSubmissions = submissions || dataService.getSubmissions() || [];

  const duyurular: Duyuru[] = (() => {
    const list: Duyuru[] = [];
    const nowMs = Date.now();
    const subOf = (hw: Homework) =>
      activeSubmissions.find((s) => s.homeworkId === hw.id && s.studentId === student.id) ||
      (Array.isArray(hw.submissions) ? hw.submissions.find((s) => s.studentId === student.id) : undefined);

    // 0) Öğretmenin gönderdiği duyuru ve notlar (en yeni üstte, son 14 gün)
    const annCutoff = nowMs - TEACHER_ANNOUNCEMENT_DAYS * 86400000;
    (announcements || [])
      .filter((a) => (a.kind === 'announcement' || a.kind === 'note') && new Date(a.createdAt).getTime() >= annCutoff)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .forEach((a) => {
        list.push({
          id: `ann-${a.id}`,
          kind: a.kind === 'note' ? 'ogretmen_notu' : 'duyuru',
          title: a.subject,
          detail: `${a.senderName ? `${a.senderName} · ` : ''}${new Date(a.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`,
          tab: 'home',
          body: a.text,
          by: a.senderName,
          at: a.createdAt,
        });
      });

    // 1) Bugünkü etütler (saat sırasıyla)
    etuts
      .filter((e) => e.date === todayStr)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .forEach((e) => {
        const where = e.location ? ` · ${e.location}` : '';
        list.push({
          id: `etut-${e.id}`,
          kind: 'etut',
          title: `Bugün ${e.time ? `${e.time} ` : ''}${e.subject} etüdün var`,
          detail: `${e.topic || ''}${where}`.replace(/^ · /, '') || undefined,
          tab: 'etuts',
        });
      });

    // 2) Bugün / yarın teslim edilecek ve henüz yapılmamış ödevler
    const shownHw = new Set<string>();
    homeworks
      .filter((hw) => {
        const day = (hw.dueDate || '').slice(0, 10);
        if (day !== todayStr && day !== tomorrowStr) return false;
        const st = homeworkStateFor(hw, subOf(hw), nowMs);
        return st === 'open' || st === 'overdue';
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .forEach((hw) => {
        const isToday = hw.dueDate.slice(0, 10) === todayStr;
        const time = hw.dueDate.includes('T') ? hw.dueDate.slice(11, 16) : '';
        shownHw.add(hw.id);
        list.push({
          id: `odev-${hw.id}`,
          kind: 'odev',
          title: `${isToday ? 'Bugün' : 'Yarın'} teslim: ${hw.title}`,
          detail: `${hw.subject}${time ? ` · saat ${time}` : ''}`,
          tab: 'homework',
        });
      });

    // 3) Bugün verilen yeni ödevler
    homeworks
      .filter((hw) => !shownHw.has(hw.id) && ((hw.assignedDate || hw.createdAt || '').slice(0, 10) === todayStr))
      .forEach((hw) => {
        list.push({
          id: `yeni-${hw.id}`,
          kind: 'yeni_odev',
          title: `Yeni ödev: ${hw.title}`,
          detail: hw.subject,
          tab: 'homework',
        });
      });

    // 4) Günlük soru hedefi — "Durumum" ve Soru Takibi ile AYNI hesap (utils/studentQuestionSummary.ts):
    //    günlere özel hedef, hedefin dersi ve tarih aralığı hesaba katılır.
    try {
      const qs = buildStudentQuestionSummary(student.id, today, dataService.getQuestionLogs());
      if (qs.todayGoal > 0) {
        const daily = qs.todayGoal;
        const solvedToday = qs.todayGoalSolved;
        const done = solvedToday >= daily;
        // Ders yazısı yalnızca bugünün hedefi derse bağlıysa gösterilir (genel hedefte "tüm dersler")
        const subjectText = qs.todayGoalSubjects.length ? ` · ${qs.todayGoalSubjects.join(', ')}` : '';
        list.push({
          id: `hedef-${qs.todayYmd}`,
          kind: 'hedef',
          title: done ? `Bugünkü soru hedefin tamam (${daily} soru)` : `Bugünkü soru hedefin: ${daily} soru`,
          detail: `Bugün ${solvedToday} soru çözdün${subjectText}${!done ? ` · ${daily - solvedToday} soru kaldı` : ''} · bu hafta ${qs.week} soru`,
          tab: 'questions',
        });
      }
    } catch {
      /* hedef okunamazsa duyuru gösterilmez */
    }

    // 5) Son günlerde girilen notlar
    const gradeCutoff = ymdOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - GRADE_DAYS));
    (grades || [])
      .filter((g) => g.studentId === student.id && (g.date || '').slice(0, 10) >= gradeCutoff)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3)
      .forEach((g) => {
        const max = Number(g.maxScore) > 0 ? Number(g.maxScore) : 100;
        list.push({
          id: `not-${g.id}`,
          kind: 'not',
          title: `Yeni not: ${g.subject} ${g.examType} — ${g.score}${max !== 100 ? `/${max}` : ''}`,
          detail: g.remarks || undefined,
          tab: 'grades',
        });
      });

    return list;
  })();

  const studentAvatarUrl =
    student.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`;

  return (
    <div id="student-agenda-wall" data-v={dataVersion} className="@container w-full bg-surface border border-line rounded-2xl p-3 sm:p-4 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 -left-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3 items-stretch relative z-10">
        {/* =========================================================================
            SOL SÜTUN: DUYURULAR (bugünün etüdü, ödevi, soru hedefi, notlar) — kompakt
           ========================================================================= */}
        <div id="student-announcements" className="min-w-0 bg-canvas/70 border border-line rounded-2xl p-3 flex flex-col shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-line mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-700 dark:text-orange-400">
                <Megaphone className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-black text-fg flex items-center gap-2">
                <span>Duyurular</span>
                {duyurular.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-orange-500 text-slate-950">{duyurular.length}</span>
                )}
              </h3>
            </div>

            <button
              type="button"
              onClick={onOpenAvatarModal}
              className="relative p-0.5 rounded-full ring-2 ring-indigo-500/40 hover:ring-indigo-400 transition-all cursor-pointer"
              title="Profil Resmini Değiştir"
            >
              <img src={studentAvatarUrl} alt={student.name} className="w-6 h-6 rounded-full object-cover bg-surface" />
            </button>
          </div>

          {duyurular.length > 0 ? (
            <ul className="space-y-1.5 max-h-[16rem] overflow-y-auto pr-1" id="student-announcement-list">
              {duyurular.map((d) => {
                const st = KIND_STYLE[d.kind];
                const Icon = d.kind === 'hedef' && d.title.includes('tamam') ? CheckCircle2 : st.icon;
                const expandable = !!d.body;
                const isOpen = expandable && openDuyuruId === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      data-duyuru={d.kind}
                      aria-expanded={expandable ? isOpen : undefined}
                      onClick={() => (expandable ? setOpenDuyuruId(isOpen ? null : d.id) : onNavigateTab(d.tab))}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg bg-surface/80 border hover:bg-surface transition-all flex items-center gap-2 cursor-pointer group ${
                        expandable ? 'border-rose-500/30 hover:border-rose-500/60' : 'border-line hover:border-orange-500/50'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${st.box}`} title={st.label}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs font-bold text-fg group-hover:text-orange-700 dark:group-hover:text-orange-300 ${isOpen ? '' : 'truncate'}`}>
                          {d.title}
                        </span>
                        {d.detail && <span className="block text-[10px] text-muted truncate">{d.detail}</span>}
                      </span>
                      {expandable && <ChevronRight className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                    </button>
                    {isOpen && (
                      <div className="mt-1 ml-8 mr-1 px-2.5 py-2 rounded-lg bg-surface border border-line text-xs text-fg-2 leading-relaxed whitespace-pre-wrap break-words">
                        {d.body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-4 text-center bg-surface/50 rounded-xl border border-line flex flex-col items-center gap-1" id="student-announcement-empty">
              <Sparkles className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              <p className="text-xs font-bold text-fg">Bugün için yeni duyuru yok.</p>
              <p className="text-[10px] text-muted">Öğretmeninin duyuruları, etüt, ödev, soru hedefi veya yeni bir not olduğunda burada görünür.</p>
            </div>
          )}
        </div>

        {/* =========================================================================
            SAĞ SÜTUN: KOMPAKT AYLIK TAKVİM
           ========================================================================= */}
        <div className="min-w-0 bg-canvas/70 border border-line rounded-2xl p-3 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between pb-1.5 border-b border-line">
            <div className="flex items-center space-x-2">
              <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-black text-fg">
                {TURKISH_MONTHS[viewMonth]} {viewYear}
              </h3>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleGoToToday}
                className="px-2 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-300 hover:text-fg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 rounded-lg transition-colors cursor-pointer"
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 text-muted hover:text-fg hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                title="Önceki Ay"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 text-muted hover:text-fg hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                title="Sonraki Ay"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center py-1 border-b border-line">
            {WEEKDAY_NAMES.map((w, idx) => (
              <span key={w} className={`text-[10px] font-bold ${idx >= 5 ? 'text-amber-700/80 dark:text-amber-400/80' : 'text-muted'}`}>
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 pt-1">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedDateStr;
              const hasHw = cell.homeworkList.length > 0;
              const hasEtut = cell.etutList.length > 0;
              return (
                <button
                  key={`${cell.dateStr}-${idx}`}
                  type="button"
                  onClick={() => setSelectedDateStr(cell.dateStr)}
                  className={`relative flex flex-col items-center justify-center h-7 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    !cell.isCurrentMonth
                      ? 'text-subtle opacity-40 hover:opacity-80'
                      : cell.isToday
                      ? 'bg-indigo-600/25 text-fg ring-1 ring-indigo-500 font-black'
                      : 'text-fg hover:bg-surface-2/80'
                  } ${isSelected ? 'bg-indigo-600 text-white ring-1 ring-indigo-400 shadow-md z-10' : ''}`}
                >
                  <span className="text-[11px] leading-none">{cell.dayNumber}</span>
                  {(hasHw || hasEtut) && (
                    <span className="flex items-center gap-0.5 mt-0.5">
                      {hasHw && <span className="w-1 h-1 rounded-full bg-amber-400" title={`${cell.homeworkList.length} Ödev Teslimi`} />}
                      {hasEtut && <span className="w-1 h-1 rounded-full bg-cyan-400" title={`${cell.etutList.length} Etüt Programı`} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-line space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-fg">
              <span className="flex items-center space-x-1.5">
                <Bookmark className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>{formatSelectedDateTurkish(selectedDateStr)}</span>
              </span>
              <span className="text-[10px] text-muted font-normal flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {selectedDetails.homeworks.length} Ödev
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  {selectedDetails.etuts.length} Etüt
                </span>
              </span>
            </div>

            {selectedDetails.hasEvents ? (
              <div className="space-y-1 max-h-16 overflow-y-auto pr-1">
                {selectedDetails.homeworks.map((hw) => (
                  <div
                    key={hw.id}
                    onClick={() => onNavigateTab('homework')}
                    className="px-1.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-[11px] text-amber-700 dark:text-amber-200 cursor-pointer"
                  >
                    <span className="flex items-center space-x-1.5 truncate">
                      <BookOpen className="w-3 h-3 shrink-0" />
                      <span className="truncate font-medium">{hw.title}</span>
                    </span>
                    <span className="text-[9px] font-bold shrink-0 ml-1.5">{hw.subject}</span>
                  </div>
                ))}
                {selectedDetails.etuts.map((et) => (
                  <div
                    key={et.id}
                    onClick={() => onNavigateTab('etuts')}
                    className="px-1.5 py-1 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between text-[11px] text-cyan-700 dark:text-cyan-200 cursor-pointer"
                  >
                    <span className="flex items-center space-x-1.5 truncate">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate font-medium">{et.subject}</span>
                    </span>
                    <span className="text-[9px] font-bold shrink-0 ml-1.5">{et.time}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted italic text-center">Bu tarihte planlanmış ödev veya etüt bulunmuyor.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
