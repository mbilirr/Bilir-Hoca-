import React, { useState, useMemo, useEffect } from 'react';
import {
  HelpCircle,
  Calendar,
  Users,
  User,
  GraduationCap,
  Download,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  X,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Award,
  Search,
  Filter,
  Check,
  Clock,
  Layers,
  Sparkles,
  Target,
  ArrowUpRight,
  Flame,
  BookOpen,
  PieChart as PieIcon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  LabelList,
} from 'recharts';
import { Student, ClassGroup, StudentQuestionLog, WeeklyQuestionTarget, StudentNotification } from '../../types';
import { dataService } from '../../services/dataService';
import { WeeklyTargetModal } from './WeeklyTargetModal';
import {
  computeWeeklyAnalytics,
  computeMonthlyAnalytics,
  downloadWeeklyPDF,
  downloadMonthlyPDF,
  formatTurkishDate,
  formatDateISO,
  getMondayOfWeek,
  TURKISH_MONTHS,
} from '../../utils/questionAnalytics';
import { matchTurkishSearch } from '../../utils/turkishSearch';

interface QuestionTrackingViewProps {
  classes: ClassGroup[];
  students: Student[];
}

export const QuestionTrackingView: React.FC<QuestionTrackingViewProps> = ({
  classes,
  students,
}) => {
  // Sınıf seçimi (varsayılan: boş, "Sınıf Seçiniz")
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Seçili öğrenci (varsayılan: boş, "Öğrenci Seçiniz")
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Aktif öğrenci (öğrenci seçildiğinde bağımsız olarak atanır)
  const activeStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Aktif sınıf (seçili sınıfa veya aktif öğrencinin sınıfına göre belirlenir)
  const activeClass = useMemo(() => {
    if (selectedClassId && selectedClassId !== 'all') {
      return classes.find((c) => c.id === selectedClassId) || null;
    }
    if (selectedClassId === 'all') {
      return { id: 'all', name: 'Tüm Sınıflar (Tüm Okul)', gradeLevel: '', branch: '' } as ClassGroup;
    }
    if (activeStudent?.classId) {
      return classes.find((c) => c.id === activeStudent.classId) || null;
    }
    return null;
  }, [classes, selectedClassId, activeStudent]);

  // Seçili sınıftaki öğrenciler
  const classStudents = useMemo(() => {
    if (selectedClassId && selectedClassId !== 'all') {
      return students.filter((s) => s.classId === selectedClassId);
    }
    if (selectedClassId === 'all') {
      return students;
    }
    if (activeClass && activeClass.id !== 'all') {
      return students.filter((s) => s.classId === activeClass.id);
    }
    return students;
  }, [students, selectedClassId, activeClass]);

  // Özel Açılır Arama Menüsü Durumları
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState<boolean>(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [dropdownScope, setDropdownScope] = useState<'class' | 'all'>('class');
  const studentDropdownRef = React.useRef<HTMLDivElement | null>(null);

  // Sınıf ve Öğrenci Seçim İşleyicileri (Tamamen bağımsız çalışma)
  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    setSelectedStudentId(''); // Sınıf seçildiğinde bütün sınıf çıksın
    setDropdownScope('class');
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setIsStudentDropdownOpen(false);
    // Öğrenci seçildiğinde, sınıfı varsa ve sınıf henüz seçilmemişse sınıfı eşle
    const st = students.find((s) => s.id === studentId);
    if (st?.classId && (!selectedClassId || selectedClassId === 'all')) {
      setSelectedClassId(st.classId);
    }
  };

  // Öğretmen Tebrik & Aferin Bildirimi Gönderme Durumları
  const [studentNotifications, setStudentNotifications] = useState<StudentNotification[]>(() =>
    dataService.getStudentNotifications()
  );
  const [praiseTargetDay, setPraiseTargetDay] = useState<{
    dateStr: string;
    dayName: string;
    totalQuestions: number;
    subjectsText?: string;
  } | null>(null);
  const [praiseCustomMessage, setPraiseCustomMessage] = useState<string>('');
  const [praiseSuccessToast, setPraiseSuccessToast] = useState<string | null>(null);

  // Dışa tıklandığında öğrenci arama menüsünü kapat
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        studentDropdownRef.current &&
        !studentDropdownRef.current.contains(e.target as Node)
      ) {
        setIsStudentDropdownOpen(false);
      }
    };
    if (isStudentDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isStudentDropdownOpen]);

  // Bildirim güncellemelerini dinle
  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setStudentNotifications(dataService.getStudentNotifications());
    });
    return unsub;
  }, []);

  // Görünüm modları: 'weekly' (Haftalık Analiz) | 'monthly' (Aylık Analiz) | 'class_overview' (Sınıf Başarı Sıralaması)
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<'weekly' | 'monthly' | 'class_overview'>('weekly');

  // Grafik görselleştirme tipi: 'bar' (Sütun Grafiği) | 'area' (Trend & Alan) | 'accuracy' (Doğru / Yanlış)
  const [chartVisualType, setChartVisualType] = useState<'bar' | 'area' | 'accuracy'>('bar');

  // Hedef Soru Sayısı (Öğretmen tarafından dinamik olarak ayarlanabilir, varsayılan 50 soru/gün)
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState<number>(50);
  const [isWeeklyTargetModalOpen, setIsWeeklyTargetModalOpen] = useState<boolean>(false);
  const [targetUpdateTrigger, setTargetUpdateTrigger] = useState<number>(0);

  // Tarih ofsetleri
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthDate, setMonthDate] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  // Açılır pencere (Geçmiş Hafta ve Geçmiş Ay Seçici Modal) durumları
  const [isWeekModalOpen, setIsWeekModalOpen] = useState<boolean>(false);
  const [weekFilterTab, setWeekFilterTab] = useState<'all' | 'with_questions'>('all');
  const [weekSearchQuery, setWeekSearchQuery] = useState<string>('');

  const [isMonthModalOpen, setIsMonthModalOpen] = useState<boolean>(false);
  const [monthFilterTab, setMonthFilterTab] = useState<'all' | 'with_questions'>('all');
  const [monthSearchQuery, setMonthSearchQuery] = useState<string>('');

  // ESC tuşu ile açılır pencereleri kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isWeekModalOpen) setIsWeekModalOpen(false);
        if (isMonthModalOpen) setIsMonthModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWeekModalOpen, isMonthModalOpen]);

  // Soru logları
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
    return unsub;
  }, []);

  const todayIsoStr = useMemo(() => formatDateISO(new Date()), []);

  // Belirli bir öğrencinin bugün kaç soru çözdüğünü döndürür
  const getStudentTodayQuestionCount = (studentId: string): number => {
    const logs = allLogs.filter((l) => l.studentId === studentId && l.date === todayIsoStr);
    return logs.reduce((sum, l) => sum + (l.totalQuestions || 0), 0);
  };

  // Öğrenci arama kutusuna göre filtrelenmiş liste (Türkçe karakter ve büyük/küçük harf duyarsız arama)
  const filteredDropdownStudents = useMemo(() => {
    const query = studentSearchQuery.trim();
    // Arama yapılıyorsa bağımsız olarak tüm öğrenciler içinde ara
    if (query) {
      return students.filter((s) => {
        const nameMatch = matchTurkishSearch(s.name, query);
        const classMatch = s.className ? matchTurkishSearch(s.className, query) : false;
        const noMatch = s.studentNumber ? s.studentNumber.toString().includes(query) : false;
        return nameMatch || classMatch || noMatch;
      });
    }

    // Arama yapılmıyorsa: sınıf seçiliyse ve kapsam sınıfsa o sınıfı, aksi halde tüm öğrencileri listele
    if (selectedClassId && selectedClassId !== 'all' && dropdownScope === 'class') {
      return classStudents;
    }
    return students;
  }, [students, classStudents, selectedClassId, dropdownScope, studentSearchQuery]);

  // Bir gün için tebrik bildirimi gönderildi mi kontrolü
  const isPraisedForDate = (dateStr: string): boolean => {
    if (!activeStudent) return false;
    return studentNotifications.some(
      (n) => n.studentId === activeStudent.id && n.type === 'praise' && n.sourceId === dateStr
    );
  };

  const handleOpenPraiseModal = (day: {
    dateStr: string;
    dayName: string;
    totalQuestions: number;
    subjectsText?: string;
  }) => {
    setPraiseTargetDay(day);
    const studentName = activeStudent?.name || 'Öğrencimiz';
    setPraiseCustomMessage(
      `Tebrikler ${studentName}! 👏 ${formatTurkishDate(day.dateStr)} tarihinde çözdüğün ${day.totalQuestions} soru ve gösterdiğin gayret için seni tebrik ederim, başarılarının devamını dilerim! ⭐`
    );
  };

  const handleSendPraise = () => {
    if (!praiseTargetDay || !activeStudent) return;
    const authSession = dataService.getAuthSession();
    const teacherName = authSession?.user?.name || 'Öğretmeniniz';

    dataService.sendStudentPraise(activeStudent.id, {
      teacherName,
      message: praiseCustomMessage,
      date: praiseTargetDay.dateStr,
      questionCount: praiseTargetDay.totalQuestions,
      subjectDetails: praiseTargetDay.subjectsText,
    });

    const targetStudentName = activeStudent.name;
    setPraiseTargetDay(null);
    setPraiseSuccessToast(
      `🎉 ${targetStudentName} öğrencisine tebrik bildirimi başarıyla gönderildi!`
    );
    setTimeout(() => {
      setPraiseSuccessToast(null);
    }, 4000);
  };

  // Aktif öğrenci için haftalık analitik
  const targetWeekDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const currentWeekStartDate = useMemo(() => {
    const mon = getMondayOfWeek(targetWeekDate);
    return formatDateISO(mon);
  }, [targetWeekDate]);

  const currentWeekEndDate = useMemo(() => {
    const mon = getMondayOfWeek(targetWeekDate);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return formatDateISO(sun);
  }, [targetWeekDate]);

  const activeWeeklyTarget = useMemo(() => {
    if (!activeStudent) return null;
    return dataService.getWeeklyQuestionTarget(activeStudent.id, currentWeekStartDate);
  }, [activeStudent, currentWeekStartDate, targetUpdateTrigger, allLogs]);

  const weeklyAnalytics = useMemo(() => {
    if (!activeStudent) return null;
    return computeWeeklyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || activeClass?.name || 'Sınıf Belirtilmedi',
      targetWeekDate
    );
  }, [allLogs, activeStudent, activeClass, targetWeekDate]);

  // Öğrencinin geçmiş haftaları ve soru sayıları (Açılır pencere için)
  const pastWeeksList = useMemo(() => {
    const currentMonday = getMondayOfWeek(new Date());
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent?.id);

    // En az 26 hafta (yaklaşık 6 ay), eğer daha eski log varsa listeyi o tarihe kadar genişlet
    let maxPastWeeks = 26;
    if (studentLogs.length > 0) {
      studentLogs.forEach((l) => {
        if (l.date) {
          const logDate = new Date(l.date + 'T00:00:00');
          if (!isNaN(logDate.getTime())) {
            const logMonday = getMondayOfWeek(logDate);
            const diffDays = Math.round((currentMonday.getTime() - logMonday.getTime()) / (1000 * 60 * 60 * 24));
            const off = Math.round(diffDays / 7);
            if (off > maxPastWeeks && off < 104) {
              maxPastWeeks = off + 2;
            }
          }
        }
      });
    }

    const list = [];
    for (let i = 0; i <= maxPastWeeks; i++) {
      const offset = -i;
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() + offset * 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      const sStr = formatDateISO(mon);
      const eStr = formatDateISO(sun);

      let weekTotal = 0;
      let weekCorrect = 0;
      let weekWrong = 0;
      const activeDays = new Set<string>();

      studentLogs.forEach((l) => {
        if (l.date >= sStr && l.date <= eStr) {
          weekTotal += l.totalQuestions || 0;
          weekCorrect += l.totalCorrect || 0;
          weekWrong += l.totalWrong || 0;
          if ((l.totalQuestions || 0) > 0) {
            activeDays.add(l.date);
          }
        }
      });

      const relativeLabel =
        offset === 0
          ? 'Bu Hafta (Güncel)'
          : offset === -1
          ? 'Geçen Hafta'
          : `${Math.abs(offset)} Hafta Önce`;

      // Sadece güncel hafta veya soru sayısı > 0 olan geçmiş haftalar eklenir; soru sayısı olmayan geçmiş haftalar tamamen silinir
      if (offset === 0 || weekTotal > 0) {
        list.push({
          offset,
          startDateStr: sStr,
          endDateStr: eStr,
          weekLabel: `${formatTurkishDate(sStr)} - ${formatTurkishDate(eStr)}`,
          relativeLabel,
          totalQuestions: weekTotal,
          totalCorrect: weekCorrect,
          totalWrong: weekWrong,
          activeDaysCount: activeDays.size,
          hasActivity: weekTotal > 0,
        });
      }
    }

    return list;
  }, [allLogs, activeStudent?.id]);

  // Filtrelenmiş geçmiş haftalar
  const filteredPastWeeks = useMemo(() => {
    return pastWeeksList.filter((item) => {
      if (weekFilterTab === 'with_questions' && !item.hasActivity) {
        return false;
      }
      if (weekSearchQuery.trim()) {
        const q = weekSearchQuery.toLowerCase().trim();
        const matchesLabel = item.weekLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastWeeksList, weekFilterTab, weekSearchQuery]);

  const activeWeeksCount = useMemo(() => {
    return pastWeeksList.filter((w) => w.hasActivity).length;
  }, [pastWeeksList]);

  // Geçmiş aylar listesi (Son 24 ay)
  const pastMonthsList = useMemo(() => {
    if (!activeStudent) return [];
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent.id);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const list: Array<{
      year: number;
      month: number;
      monthLabel: string;
      relativeLabel: string;
      totalQuestions: number;
      totalCorrect: number;
      totalWrong: number;
      activeDaysCount: number;
      hasActivity: boolean;
    }> = [];

    for (let offset = 0; offset < 24; offset++) {
      const d = new Date(currentYear, currentMonth - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const sStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const eStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      let monthTotal = 0;
      let monthCorrect = 0;
      let monthWrong = 0;
      const activeDays = new Set<string>();

      studentLogs.forEach((l) => {
        if (l.date >= sStr && l.date <= eStr) {
          monthTotal += l.totalQuestions || 0;
          monthCorrect += l.totalCorrect || 0;
          monthWrong += l.totalWrong || 0;
          if ((l.totalQuestions || 0) > 0) {
            activeDays.add(l.date);
          }
        }
      });

      const relativeLabel =
        offset === 0
          ? 'Bu Ay (Güncel)'
          : offset === 1
          ? 'Geçen Ay'
          : `${offset} Ay Önce`;

      const monthName = TURKISH_MONTHS[m] || '';
      const monthLabel = `${monthName} ${y}`;

      // Sadece güncel ay veya soru sayısı > 0 olan geçmiş aylar eklenir; soru sayısı olmayan geçmiş aylar tamamen silinir
      if (offset === 0 || monthTotal > 0) {
        list.push({
          year: y,
          month: m,
          monthLabel,
          relativeLabel,
          totalQuestions: monthTotal,
          totalCorrect: monthCorrect,
          totalWrong: monthWrong,
          activeDaysCount: activeDays.size,
          hasActivity: monthTotal > 0,
        });
      }
    }

    return list;
  }, [allLogs, activeStudent?.id]);

  const filteredPastMonths = useMemo(() => {
    return pastMonthsList.filter((item) => {
      if (monthFilterTab === 'with_questions' && !item.hasActivity) {
        return false;
      }
      if (monthSearchQuery.trim()) {
        const q = monthSearchQuery.toLowerCase().trim();
        const matchesLabel = item.monthLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastMonthsList, monthFilterTab, monthSearchQuery]);

  const activeMonthsCount = useMemo(() => {
    return pastMonthsList.filter((m) => m.hasActivity).length;
  }, [pastMonthsList]);

  // Aktif öğrenci için aylık analitik
  const monthlyAnalytics = useMemo(() => {
    if (!activeStudent) return null;
    return computeMonthlyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || activeClass?.name || 'Sınıf Belirtilmedi',
      monthDate.year,
      monthDate.month
    );
  }, [allLogs, activeStudent, activeClass, monthDate]);

  // Sınıf genel özeti & sıralaması
  const classOverviewData = useMemo(() => {
    if (classStudents.length === 0) return [];
    const classNameStr = activeClass?.name || 'Sınıf';
    return classStudents.map((st) => {
      const stWeekly = computeWeeklyAnalytics(
        allLogs,
        st.id,
        st.name,
        st.className || classNameStr,
        targetWeekDate
      );
      const stMonthly = computeMonthlyAnalytics(
        allLogs,
        st.id,
        st.name,
        st.className || classNameStr,
        monthDate.year,
        monthDate.month
      );
      return {
        student: st,
        weeklyTotal: stWeekly.totalQuestions,
        weeklyAvg: stWeekly.dailyAverage,
        unsolvedDaysCount: stWeekly.unsolvedDaysCount,
        unsolvedDays: stWeekly.unsolvedDays,
        weeklyDiff: stWeekly.weeklyDifference,
        weeklyGrowthRate: stWeekly.weeklyGrowthRate,
        accuracyPercentage: stWeekly.accuracyPercentage,
        monthlyTotal: stMonthly.totalQuestions,
        monthlyDiff: stMonthly.monthlyDifference,
        badgeText: stWeekly.statusAssessment.badgeText,
        badgeClass: stWeekly.statusAssessment.badgeClass,
      };
    }).sort((a, b) => b.weeklyTotal - a.weeklyTotal);
  }, [activeClass, classStudents, allLogs, targetWeekDate, monthDate]);

  // Sınıf genel istatistik özeti
  const classSummaryStats = useMemo(() => {
    const studentCount = classStudents.length;
    const weeklyTotal = classOverviewData.reduce((sum, d) => sum + d.weeklyTotal, 0);
    const monthlyTotal = classOverviewData.reduce((sum, d) => sum + d.monthlyTotal, 0);
    const weeklyAvgPerStudent = studentCount > 0 ? Math.round(weeklyTotal / studentCount) : 0;
    const dailyAvgPerStudent = Math.round(weeklyAvgPerStudent / 7);

    const todaySolvedCount = classStudents.filter((s) => getStudentTodayQuestionCount(s.id) > 0).length;
    const todayTotalQuestions = classStudents.reduce(
      (sum, s) => sum + getStudentTodayQuestionCount(s.id),
      0
    );

    const topStudent = classOverviewData.length > 0 && classOverviewData[0].weeklyTotal > 0
      ? classOverviewData[0]
      : null;

    return {
      studentCount,
      weeklyTotal,
      monthlyTotal,
      weeklyAvgPerStudent,
      dailyAvgPerStudent,
      todaySolvedCount,
      todayTotalQuestions,
      topStudent,
    };
  }, [classStudents, classOverviewData, allLogs, todayIsoStr]);

  // Haftalık Hedef Tamamlama Oranı Hesabı (Öğretmenin atadığı hedef öncelikli)
  const weeklyTargetTotal = activeWeeklyTarget?.targetQuestions || (dailyQuestionTarget * 7);
  const weeklyTargetCompletionRate = useMemo(() => {
    if (!weeklyAnalytics || weeklyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((weeklyAnalytics.totalQuestions / weeklyTargetTotal) * 100));
  }, [weeklyAnalytics, weeklyTargetTotal]);

  // Aylık Hedef Tamamlama Oranı Hesabı (30 gün üzerinden)
  const monthlyTargetTotal = dailyQuestionTarget * 30;
  const monthlyTargetCompletionRate = useMemo(() => {
    if (!monthlyAnalytics || monthlyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((monthlyAnalytics.totalQuestions / monthlyTargetTotal) * 100));
  }, [monthlyAnalytics, monthlyTargetTotal]);

  // Looker Studio Custom Tooltip Component (Temiz Beyaz Arka Plan & Koyu Gri Metinler & Canlı Turuncu)
  const renderLookerTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200/90 shadow-xl rounded-xl p-3.5 text-xs text-slate-800 space-y-1.5 z-50 min-w-[210px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="font-bold text-[#0f172a] text-xs">
              {data.dayName ? `${data.dayName} (${formatTurkishDate(data.dateStr)})` : data.weekLabel}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
              {data.totalQuestions > 0 ? `${data.totalQuestions} Soru` : '0 Soru'}
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-slate-600">
              <span>Toplam Çözülen:</span>
              <strong className="text-[#0f172a] font-bold text-xs">{data.totalQuestions} Soru</strong>
            </div>

            {data.totalCorrect !== undefined && data.totalCorrect > 0 && (
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Doğru:
                </span>
                <span className="font-bold text-emerald-700">{data.totalCorrect}</span>
              </div>
            )}

            {data.totalWrong !== undefined && data.totalWrong > 0 && (
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 text-rose-500">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Yanlış:
                </span>
                <span className="font-bold text-rose-700">{data.totalWrong}</span>
              </div>
            )}

            {data.totalQuestions >= dailyQuestionTarget ? (
              <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 pt-1 border-t border-slate-100">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Günlük Hedefe Ulaşıldı (%{Math.round((data.totalQuestions / dailyQuestionTarget) * 100)})</span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-[11px] text-orange-600 font-medium pt-1 border-t border-slate-100">
                Hedefe {dailyQuestionTarget - data.totalQuestions} soru kaldı
              </div>
            ) : (
              <div className="text-[11px] text-rose-600 font-medium flex items-center gap-1 pt-1 border-t border-slate-100">
                <AlertCircle className="w-3 h-3 text-rose-500" />
                <span>Bu gün soru çözülmedi</span>
              </div>
            )}

            {data.subjectsText && (
              <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-500 truncate max-w-[200px]">
                {data.subjectsText}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* GOOGLE LOOKER STUDIO - EXECUTIVE CONTROL BAR & APP HEADER               */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
        {/* Top Looker Studio Header Brand */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0f172a] text-white flex items-center justify-center shadow-md shadow-slate-900/10">
              <BarChart3 className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  Google Looker Studio
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Eğitim Analitik Modülü</span>
              </div>
              <h2 className="text-lg font-bold text-[#0f172a] tracking-tight">
                Öğrenci Soru Sayısı ve Başarı Takip Dashboard'u
              </h2>
            </div>
          </div>

          {/* Quick PDF & Export Bar */}
          <div className="flex items-center gap-2">
            {activeStudent && (
              <>
                {/* Haftalık Hedef Belirleme Butonu */}
                <button
                  type="button"
                  id="btn-set-weekly-target"
                  onClick={() => setIsWeeklyTargetModalOpen(true)}
                  className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-orange-500/20 cursor-pointer"
                  title="Öğrenciye bu hafta için soru sayısı hedefi ata"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>
                    {activeWeeklyTarget ? `Hedef: ${activeWeeklyTarget.targetQuestions} Soru (Düzenle)` : '🎯 Haftalık Hedef Ver'}
                  </span>
                </button>

                {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
                  <button
                    id="btn-looker-pdf-weekly"
                    onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                    className="px-3.5 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Haftalık Raporu İndir (PDF)</span>
                  </button>
                )}
                {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
                  <button
                    id="btn-looker-pdf-monthly"
                    onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                    className="px-3.5 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Aylık Raporu İndir (PDF)</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Parameter Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          {/* 1. Sınıf Seçimi */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#1e3a8a]" />
                Sınıf Filtresi
              </span>
              {selectedClassId && (
                <button
                  type="button"
                  onClick={() => handleSelectClass('')}
                  className="text-[10px] text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                >
                  Sınıfı Temizle ✕
                </button>
              )}
            </label>
            <select
              id="looker-filter-class"
              value={selectedClassId}
              onChange={(e) => handleSelectClass(e.target.value)}
              className="w-full bg-white border border-slate-300 text-xs font-semibold text-[#0f172a] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              <option value="">Sınıf Seçiniz</option>
              <option value="all">Tüm Sınıflar (Tüm Okul - {students.length} Öğrenci)</option>
              {classes.map((c) => {
                const count = students.filter((s) => s.classId === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} Öğrenci)
                  </option>
                );
              })}
            </select>
          </div>

          {/* 2. Öğrenci Seçimi (Arama Kutulu & Renk Vurgulu Özel Açılır Menü) */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200 relative" ref={studentDropdownRef}>
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-orange-600" />
                Öğrenci Seçimi
              </span>
              {selectedStudentId && (
                <button
                  type="button"
                  onClick={() => setSelectedStudentId('')}
                  className="text-[10px] text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                >
                  Seçimi Kaldır ✕
                </button>
              )}
            </label>

            <button
              id="looker-filter-student-btn"
              type="button"
              onClick={() => {
                setIsStudentDropdownOpen((prev) => !prev);
                setStudentSearchQuery('');
              }}
              className="w-full bg-white border border-slate-300 text-xs rounded-lg px-3 py-1.5 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer text-left shadow-2xs hover:border-slate-400 transition-colors"
            >
              {activeStudent ? (
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`font-bold ${
                      getStudentTodayQuestionCount(activeStudent.id) > 0
                        ? 'text-emerald-700 font-black'
                        : 'text-[#0f172a]'
                    }`}
                  >
                    {activeStudent.name}
                  </span>
                  {activeStudent.className && (
                    <span className="text-[10px] text-slate-400 truncate">
                      ({activeStudent.className})
                    </span>
                  )}
                  {getStudentTodayQuestionCount(activeStudent.id) > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                      🎯 {getStudentTodayQuestionCount(activeStudent.id)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-500 font-medium">Öğrenci Seçiniz</span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  isStudentDropdownOpen ? 'rotate-180 text-orange-500' : ''
                }`}
              />
            </button>

            {/* Açılır Arama ve Öğrenci Seçim Paneli */}
            {isStudentDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-300 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in duration-100">
                {/* En üstteki Yapışkan Arama Kutusu */}
                <div className="p-2 border-b border-slate-200 bg-slate-50 sticky top-0 z-20 space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Öğrenci ara (büyük/küçük harf duyarsız)..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    />
                    {studentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setStudentSearchQuery('')}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Kapsam Filtresi: Eğer sınıf seçilmişse sınıf içi veya tüm okul toggle'ı */}
                  {selectedClassId && selectedClassId !== 'all' && (
                    <div className="flex rounded-md bg-slate-200/80 p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDropdownScope('class')}
                        className={`flex-1 py-1 rounded transition-colors ${
                          dropdownScope === 'class'
                            ? 'bg-white text-orange-700 shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {activeClass?.name || 'Sınıf'} ({classStudents.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDropdownScope('all')}
                        className={`flex-1 py-1 rounded transition-colors ${
                          dropdownScope === 'all'
                            ? 'bg-white text-orange-700 shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tüm Okul ({students.length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Seçim Seçenekleri */}
                <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId('');
                      setIsStudentDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                  >
                    <span>Öğrenci Seçiniz (Seçimi Temizle)</span>
                    {!selectedStudentId && <Check className="w-3.5 h-3.5 text-orange-600" />}
                  </button>

                  {filteredDropdownStudents.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      Eşleşen öğrenci bulunamadı.
                    </div>
                  ) : (
                    filteredDropdownStudents.map((s) => {
                      const todayCount = getStudentTodayQuestionCount(s.id);
                      const hasSolvedToday = todayCount > 0;
                      const isSelected = selectedStudentId === s.id;

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectStudent(s.id)}
                          className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            hasSolvedToday
                              ? isSelected
                                ? 'bg-emerald-100/90 text-emerald-950 font-black border-l-4 border-emerald-600'
                                : 'bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-900 border-l-4 border-emerald-500'
                              : isSelected
                              ? 'bg-orange-50 text-orange-950 font-bold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`truncate ${
                                hasSolvedToday
                                  ? 'text-emerald-700 font-extrabold flex items-center gap-1.5'
                                  : 'font-semibold'
                              }`}
                            >
                              {hasSolvedToday && (
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              )}
                              {s.name}
                            </span>
                            {s.className && (
                              <span className="text-[10px] text-slate-400 shrink-0">
                                ({s.className})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {hasSolvedToday && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                                🎯 Bugün {todayCount} Soru
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-orange-600" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Görünüm Dönemi (Haftalık / Aylık / Sınıf Sıralaması) */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#1e3a8a]" />
              Analiz Boyutu
            </label>
            <div className="flex rounded-lg bg-white border border-slate-300 p-0.5">
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('weekly')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'weekly'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Haftalık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('monthly')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'monthly'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Aylık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('class_overview')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'class_overview'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Sınıf
              </button>
            </div>
          </div>
        </div>
      </div>

      {!activeStudent ? (
        selectedClassId ? (
          /* ========================================================================= */
          /* BÜTÜN SINIF GÖRÜNÜMÜ ("Sınıf seçince bütün sınıf çıksın")                */
          /* ========================================================================= */
          <div className="space-y-6">
            {/* Sınıf Başlık ve Bilgilendirme Kartı */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-xs">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                        Bütün Sınıf Raporu
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {classStudents.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-[#0f172a] tracking-tight mt-0.5">
                      {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm & Başarı Raporu
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStudentDropdownOpen(true);
                      setStudentSearchQuery('');
                    }}
                    className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Öğrenci Seçip İncele</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectClass('')}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="Sınıf seçimini temizle"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Sınıfı Kapat</span>
                  </button>
                </div>
              </div>

              {/* Sınıf Genel KPI Kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4">
                <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>Sınıf Mevcudu</span>
                    <Users className="w-4 h-4 text-[#1e3a8a]" />
                  </div>
                  <div className="text-2xl font-black text-[#0f172a]">
                    {classStudents.length} <span className="text-xs font-normal text-slate-500">Öğrenci</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                    Bugün {classSummaryStats.todaySolvedCount} öğrenci soru girişi yaptı
                  </div>
                </div>

                <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>Bu Hafta Sınıf Toplamı</span>
                    <BarChart3 className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="text-2xl font-black text-orange-600">
                    {classSummaryStats.weeklyTotal} <span className="text-xs font-normal text-slate-500">Soru</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Haftalık sınıf geneli çözülen toplam
                  </div>
                </div>

                <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>Öğrenci Başına Haftalık Ortalama</span>
                    <Target className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-700">
                    {classSummaryStats.weeklyAvgPerStudent} <span className="text-xs font-normal text-slate-500">Soru</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Günlük ortalama ~{classSummaryStats.dailyAvgPerStudent} soru
                  </div>
                </div>

                <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                    <span>Bu Ay Sınıf Toplamı</span>
                    <Sparkles className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-2xl font-black text-purple-700">
                    {classSummaryStats.monthlyTotal} <span className="text-xs font-normal text-slate-500">Soru</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Aylık genel sınıf soru hacmi
                  </div>
                </div>
              </div>
            </div>

            {/* Sınıfın Tüm Öğrencilerinin Soru Çözüm Sıralaması Tablosu */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                    <span>{activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Başarı & Soru Sıralaması</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {classOverviewData.length} Öğrenci
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    İncelemek istediğiniz öğrencinin üzerine veya <strong>"Analiz Aç"</strong> butonuna tıklayarak bireysel analiz ekranına geçebilirsiniz.
                  </p>
                </div>
              </div>

              {classOverviewData.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Bu sınıfta henüz kayıtlı öğrenci bulunmuyor.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Sıra</th>
                        <th className="px-4 py-3">Öğrenci Adı</th>
                        <th className="px-4 py-3 text-center">Bugün Çözülen</th>
                        <th className="px-4 py-3 text-center">Bu Hafta Çözülen</th>
                        <th className="px-4 py-3 text-center">Soru Çözülmeyen Günler</th>
                        <th className="px-4 py-3 text-center">Haftalık İlerleme</th>
                        <th className="px-4 py-3 text-center">Bu Ay Toplam</th>
                        <th className="px-4 py-3 text-center">Başarı Seviyesi</th>
                        <th className="px-4 py-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classOverviewData.map((row, idx) => {
                        const todayCount = getStudentTodayQuestionCount(row.student.id);
                        return (
                          <tr
                            key={row.student.id}
                            className="hover:bg-orange-50/40 transition-colors group cursor-pointer"
                            onClick={() => handleSelectStudent(row.student.id)}
                          >
                            <td className="px-4 py-3.5 font-bold text-slate-500">
                              {idx === 0 ? (
                                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-black text-[11px]">
                                  🥇
                                </span>
                              ) : idx === 1 ? (
                                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-black text-[11px]">
                                  🥈
                                </span>
                              ) : idx === 2 ? (
                                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-800 flex items-center justify-center font-black text-[11px]">
                                  🥉
                                </span>
                              ) : (
                                idx + 1
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-[#0f172a] group-hover:text-orange-600 transition-colors text-sm">
                                {row.student.name}
                              </div>
                              {row.student.studentNumber && (
                                <div className="text-[10px] text-slate-400">
                                  No: {row.student.studentNumber}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {todayCount > 0 ? (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  🎯 {todayCount} Soru
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px] font-medium">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-[#0f172a] text-sm">
                              {row.weeklyTotal} Soru
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {row.unsolvedDaysCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                  {row.unsolvedDaysCount} Gün Boş
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Her Gün Çözüldü
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold">
                              <span className={row.weeklyDiff >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                                {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} ({row.weeklyGrowthRate >= 0 ? '+' : ''}%{row.weeklyGrowthRate})
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-[#1e3a8a]">
                              {row.monthlyTotal} Soru
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#f8fafc] text-[#0f172a] border border-slate-200">
                                {row.badgeText}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectStudent(row.student.id);
                                }}
                                className="px-3 py-1.5 bg-[#0f172a] hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
                              >
                                <span>Analiz Aç</span>
                                <span>→</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sınıftaki Öğrencilerin Hızlı Kartları */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-[#0f172a] uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-orange-600" />
                  <span>Sınıf Öğrenci Kartları ({classStudents.length})</span>
                </h4>
                <span className="text-[11px] text-slate-500">
                  Kart üzerine tıklayarak öğrenci analizine hızlıca geçebilirsiniz
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {classStudents.map((s) => {
                  const todayCount = getStudentTodayQuestionCount(s.id);
                  const overviewItem = classOverviewData.find((d) => d.student.id === s.id);
                  const weeklyTotal = overviewItem?.weeklyTotal || 0;

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectStudent(s.id)}
                      className="p-3.5 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:from-orange-50/70 hover:to-amber-50/50 hover:border-orange-300 transition-all text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-extrabold text-xs text-[#0f172a] group-hover:text-orange-600 transition-colors">
                            {s.name}
                          </div>
                          {s.studentNumber && (
                            <div className="text-[10px] text-slate-400">
                              No: {s.studentNumber}
                            </div>
                          )}
                        </div>
                        {todayCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs shrink-0">
                            🎯 {todayCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <span className="font-semibold text-slate-700">Bu Hafta: <strong className="text-orange-600 font-extrabold">{weeklyTotal} Soru</strong></span>
                        <span className="text-orange-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                          İncele →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* HOŞ GELDİNİZ VE SINIF SEÇİM PANELİ (SINIF VEYA ÖĞRENCİ SEÇİLMEDİĞİNDE)     */
          /* ========================================================================= */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-10 shadow-sm space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-2 shadow-xs">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#0f172a]">
                Lütfen İncelemek İstediğiniz Sınıfı veya Öğrenciyi Seçiniz
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Bir <strong>sınıf seçerek bütün sınıfın</strong> soru çözümlerini ve başarı sıralamasını listeleyebilir, veya <strong>öğrenci seçerek</strong> tek bir öğrencinin ayrıntılı haftalık/aylık analizini inceleyebilirsiniz.
              </p>
            </div>

            {/* Hızlı Sınıf Seçim Kartları */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-[#0f172a] uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-orange-600" />
                  <span>Sınıflar ({classes.length})</span>
                </h4>
                <span className="text-[11px] text-slate-500">
                  Tüm sınıfı görüntülemek için tıklayın
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {classes.map((c) => {
                  const classStCount = students.filter((s) => s.classId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectClass(c.id)}
                      className="p-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white hover:border-orange-400 hover:from-orange-50/50 transition-all text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-black text-[#0f172a] group-hover:text-orange-600 transition-colors">
                          {c.name}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                          {classStCount} Öğrenci
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <span>Bütün sınıfı gör</span>
                        <span className="text-orange-600 font-bold group-hover:translate-x-0.5 transition-transform">
                          Görüntüle →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bugün Soru Çözen Öğrenciler Hızlı Erişim Kartları */}
            {(() => {
              const todaySolvedStudents = students
                .map((s) => ({
                  student: s,
                  todayQuestions: getStudentTodayQuestionCount(s.id),
                }))
                .filter((x) => x.todayQuestions > 0);

              if (todaySolvedStudents.length === 0) {
                return (
                  <div className="bg-slate-50 rounded-xl p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
                    Bugün henüz sisteme soru girişi yapan öğrenci bulunmuyor. Yukarıdaki menüden geçmiş günlerin analizini incelemek istediğiniz sınıfı veya öğrenciyi seçebilirsiniz.
                  </div>
                );
              }

              return (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Bugün Soru Çözen Öğrenciler ({todaySolvedStudents.length})</span>
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Öğrenciye tıklayarak bireysel analizi görüntüleyebilirsiniz
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {todaySolvedStudents.map(({ student: s, todayQuestions }) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudent(s.id)}
                        className="p-3.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 hover:from-emerald-100/90 hover:to-teal-100/60 transition-all text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="font-extrabold text-xs text-emerald-950 group-hover:text-emerald-800 transition-colors">
                            {s.name}
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs shrink-0">
                            {todayQuestions} Soru
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-emerald-100/60">
                          <span className="truncate">{s.className || 'Sınıf Belirtilmedi'}</span>
                          <span className="text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                            İncele →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )
      ) : (
        <>
          {/* ========================================================================= */}
          {/* TAB 1: HAFTALIK LOOKER STUDIO DASHBOARD                                  */}
          {/* ========================================================================= */}
          {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
            <div className="space-y-6">
              {/* Hafta Gezinme ve Öğrenci Kimlik Kartı */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Açılır Pencere ile Hafta Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-week-picker-modal"
                    type="button"
                    onClick={() => setIsWeekModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-[#f8fafc] hover:bg-orange-50/60 border border-slate-300 hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    title="Geçmiş haftaları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100/80 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">
                          {weekOffset === 0 ? 'Güncel Dönem' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                        </span>
                        {weekOffset !== 0 ? (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded-md">
                            Geçmiş Hafta
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                            Aktif Hafta
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                        <span className="hidden xs:inline text-slate-500 font-medium">İncelenen Hafta:</span>
                        <span className="text-[#1e3a8a] underline decoration-orange-400/60 decoration-2 underline-offset-2">
                          {weeklyAnalytics.weekLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-slate-200 text-slate-400 group-hover:text-orange-600 flex items-center gap-1 text-xs font-semibold shrink-0">
                      <span className="hidden md:inline text-[11px] text-slate-500 group-hover:text-orange-700 font-medium">
                        Açılır Pencere
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 md:text-slate-400" />
                    </div>
                  </button>

                  {weekOffset !== 0 && (
                    <button
                      id="btn-reset-current-week"
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Bugünün güncel haftasına dön"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Güncel Haftaya Dön</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {activeClass && (
                    <button
                      type="button"
                      onClick={() => setSelectedStudentId('')}
                      className="px-3 py-2 bg-slate-100 hover:bg-orange-50 hover:border-orange-300 text-slate-700 hover:text-orange-900 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Sınıfın bütün öğrencilerini ve başarı sıralamasını gör"
                    >
                      <Users className="w-3.5 h-3.5 text-orange-600" />
                      <span>{activeClass.name} Sınıfının Tümünü Göster ({classStudents.length})</span>
                    </button>
                  )}
                  <div className="flex items-center gap-3 bg-[#f8fafc] px-4 py-2 rounded-xl border border-slate-200">
                    <div className="w-8 h-8 rounded-full bg-[#0f172a] text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
                      {activeStudent.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-[#0f172a] block">{activeStudent.name}</span>
                      {activeStudent.className && (
                        <span className="text-[10px] text-slate-400 block">{activeStudent.className}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* LOOKER STUDIO EXECUTIVE KPI SCORECARDS (TEMİZ BEYAZ & GECE MAVİSİ & TURUNCU) */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Toplam Çözülen Soru & İlerleme */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Haftalık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {weeklyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Soru</span>
                  </div>

                  {/* Deltası */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
                    {weeklyAnalytics.weeklyDifference >= 0 ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        +{weeklyAnalytics.weeklyDifference} soru (+%{weeklyAnalytics.weeklyGrowthRate})
                      </span>
                    ) : (
                      <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        {weeklyAnalytics.weeklyDifference} soru (%{weeklyAnalytics.weeklyGrowthRate})
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Önceki Hafta: <strong className="text-slate-700">{weeklyAnalytics.previousWeekTotal} soru</strong>
                  </div>
                </div>

                {/* 2. Kurs / Müfredat Hedef Bitirme Oranı (%) */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span>Haftalık Soru Hedefi</span>
                      {activeWeeklyTarget && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Öğretmen Hedefi
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsWeeklyTargetModalOpen(true)}
                      className="p-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-600 transition-colors cursor-pointer"
                      title="Haftalık Soru Hedefini Belirle / Güncelle"
                    >
                      <Target className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-orange-600 tracking-tight">
                      %{weeklyTargetCompletionRate}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {weeklyAnalytics.totalQuestions} / {weeklyTargetTotal} Soru
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, weeklyTargetCompletionRate)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex justify-between items-center">
                    <span>
                      Hedef: <strong>{weeklyTargetTotal} Soru</strong>
                      {weeklyAnalytics.totalQuestions >= weeklyTargetTotal ? (
                        <span className="text-emerald-600 font-bold ml-1.5">✓ Tamamlandı!</span>
                      ) : (
                        <span className="text-orange-600 font-semibold ml-1.5">
                          ({weeklyTargetTotal - weeklyAnalytics.totalQuestions} kaldı)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsWeeklyTargetModalOpen(true)}
                      className="text-[10px] font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                    >
                      Hedef Belirle
                    </button>
                  </div>
                </div>

                {/* 3. Çalışma Disiplini & Soru Çözülmeyen Günler */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Çalışma Disiplini</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {weeklyAnalytics.solvedDaysCount}
                      <span className="text-base text-slate-400 font-semibold"> / 7 Gün</span>
                    </span>
                  </div>

                  {/* Soru Çözülmeyen Günler Rozeti */}
                  <div className="mt-3">
                    {weeklyAnalytics.unsolvedDaysCount > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-orange-600" />
                          {weeklyAnalytics.unsolvedDaysCount} Gün Çözülmedi
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          ({weeklyAnalytics.unsolvedDays.join(', ')})
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        7 Gün Kesintisiz Çalışma
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Haftalık Devamlılık Oranı: <strong className="text-slate-700">%{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Öğrenci Başarı Durumu & Doğruluk Oranı */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Başarı & Doğruluk Oranı</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#1e3a8a] tracking-tight">
                      %{weeklyAnalytics.accuracyPercentage}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Net Başarı</span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#0f172a] text-white">
                      {weeklyAnalytics.statusAssessment.badgeText}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex gap-2">
                    <span className="text-emerald-600 font-semibold">D: {weeklyAnalytics.totalCorrect}</span>
                    <span className="text-rose-600 font-semibold">Y: {weeklyAnalytics.totalWrong}</span>
                    <span className="text-slate-500">B: {weeklyAnalytics.totalEmpty}</span>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* GOOGLE LOOKER STUDIO ANA GRAFİĞİ (HAFİF GRİ ARKA PLAN, KOYU GRİ METİNLER) */}
              {/* ========================================================================= */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                {/* Chart Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-[#0f172a] tracking-tight">
                        Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#0f172a] text-white">
                        {weeklyAnalytics.studentName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Dönem: {weeklyAnalytics.weekLabel} • Sütun tepelerinde net soru sayıları ve turuncu günlük hedef çizgisi
                    </p>
                  </div>

                  {/* Chart Type & Legend Switcher */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Legend */}
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 mr-2">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#1e3a8a] inline-block" /> Çözülen Soru
                      </span>
                      <span className="flex items-center gap-1.5 text-orange-600">
                        <span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Hedef ({dailyQuestionTarget})
                      </span>
                      <span className="flex items-center gap-1.5 text-rose-600">
                        <span className="w-3 h-3 rounded bg-rose-500 inline-block" /> 0 Soru
                      </span>
                    </div>

                    {/* Chart Mode Buttons */}
                    <div className="flex rounded-lg bg-[#f1f5f9] p-0.5 border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setChartVisualType('bar')}
                        className={`px-3 py-1 rounded-md font-bold transition-all ${
                          chartVisualType === 'bar'
                            ? 'bg-white text-[#0f172a] shadow-xs'
                            : 'text-slate-600 hover:text-[#0f172a]'
                        }`}
                      >
                        Sütun Grafiği
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartVisualType('area')}
                        className={`px-3 py-1 rounded-md font-bold transition-all ${
                          chartVisualType === 'area'
                            ? 'bg-white text-[#0f172a] shadow-xs'
                            : 'text-slate-600 hover:text-[#0f172a]'
                        }`}
                      >
                        Trend & Alan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Plot Area with Light Gray Background */}
                <div className="h-80 w-full bg-[#f8fafc] rounded-xl p-3 border border-slate-200/80">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartVisualType === 'bar' ? (
                      <BarChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="dayName"
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <Tooltip content={renderLookerTooltip} />

                        {/* Canlı Turuncu Hedef Referans Çizgisi */}
                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke="#ea580c"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: `Hedef: ${dailyQuestionTarget} Soru`,
                            fill: '#ea580c',
                            fontSize: 11,
                            fontWeight: 700,
                            position: 'insideTopRight',
                          }}
                        />

                        {/* Sütun Çizimi ve Tepede Net Değerler (LabelList) */}
                        <Bar
                          dataKey="totalQuestions"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={55}
                        >
                          {/* Sütunların üzerine net sayıları yazdır */}
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="#0f172a"
                            fontSize={12}
                            fontWeight={800}
                            offset={8}
                            formatter={(val: number) => (val > 0 ? val : '0')}
                          />
                          {weeklyAnalytics.days.map((entry, index) => {
                            // Gece mavisi (#1e3a8a), hedefe ulaştıysa lacivert, 0 ise belirgin turuncu/rose
                            const isZero = entry.totalQuestions === 0;
                            const isAboveTarget = entry.totalQuestions >= dailyQuestionTarget;
                            return (
                              <Cell
                                key={`cell-looker-${index}`}
                                fill={isZero ? '#f43f5e' : isAboveTarget ? '#1e3a8a' : '#3b82f6'}
                                opacity={isZero ? 0.85 : 1}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="lookerNavyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="dayName"
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <Tooltip content={renderLookerTooltip} />

                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke="#ea580c"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: `Hedef: ${dailyQuestionTarget} Soru`,
                            fill: '#ea580c',
                            fontSize: 11,
                            fontWeight: 700,
                            position: 'insideTopRight',
                          }}
                        />

                        <Area
                          type="monotone"
                          dataKey="totalQuestions"
                          stroke="#1e3a8a"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#lookerNavyGradient)"
                          dot={{ r: 5, fill: '#ea580c', stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 7, fill: '#ea580c' }}
                        >
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="#0f172a"
                            fontSize={12}
                            fontWeight={800}
                            offset={8}
                          />
                        </Area>
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* KURS BİTİRME ORANLARI & DERS DAĞILIMI & YAZILI VERİ TABLOSU               */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sol / 2 Kolon: Yazılı Looker Studio Veri Tablosu */}
                <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-bold text-[#0f172a]">
                        Günlük Soru Çözüm ve Başarı Tablosu
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Öğrenci: <strong className="text-slate-800">{weeklyAnalytics.studentName}</strong> • {weeklyAnalytics.className}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#f8fafc] text-slate-700 border border-slate-200">
                      7 Günlük Detay
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5">Gün</th>
                          <th className="px-3.5 py-2.5">Tarih</th>
                          <th className="px-3.5 py-2.5 text-center">Çözülen Soru</th>
                          <th className="px-3.5 py-2.5">Ders Dağılımı</th>
                          <th className="px-3.5 py-2.5 text-center">Hedef Durumu</th>
                          <th className="px-3.5 py-2.5 text-center">Durum</th>
                          <th className="px-3.5 py-2.5 text-center">Öğretmen Tebriki</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {weeklyAnalytics.days.map((d) => {
                          const metTarget = d.totalQuestions >= dailyQuestionTarget;
                          const completionRate = Math.min(100, Math.round((d.totalQuestions / dailyQuestionTarget) * 100));
                          const praised = isPraisedForDate(d.dateStr);

                          return (
                            <tr key={d.dateStr} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3.5 py-2.5 font-bold text-[#0f172a]">{d.dayName}</td>
                              <td className="px-3.5 py-2.5 text-slate-500">{formatTurkishDate(d.dateStr)}</td>
                              <td className="px-3.5 py-2.5 text-center">
                                <span className="font-extrabold text-[#0f172a] text-sm">
                                  {d.totalQuestions}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-600 truncate max-w-xs">
                                {d.subjectsText || <span className="text-slate-400 italic">Ders kaydı yok</span>}
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full ${metTarget ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                      style={{ width: `${completionRate}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-600">%{completionRate}</span>
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                {d.hasSolved ? (
                                  metTarget ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Hedef Tamamlandı
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      Kısmi Çözüm
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    0 Soru ⚠️
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                {d.totalQuestions > 0 ? (
                                  praised ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Tebrik Edildi ✓</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPraiseModal(d)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white shadow-xs hover:shadow transition-all cursor-pointer hover:scale-105"
                                      title={`${activeStudent?.name} öğrencisine ${d.dayName} günü çözdüğü ${d.totalQuestions} soru için tebrik ve aferin mesajı gönder`}
                                    >
                                      <Award className="w-3.5 h-3.5 text-amber-100" />
                                      <span>Tebrik Et ⭐</span>
                                    </button>
                                  )
                                ) : (
                                  <span className="text-slate-300 text-xs italic">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sağ / 1 Kolon: Kurs / Ders Bitirme Oranları & Pedagojik Rapor */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                      <BookOpen className="w-4 h-4 text-orange-600" />
                      <h4 className="text-sm font-bold text-[#0f172a]">
                        Kurs & Ders Bitirme Oranları
                      </h4>
                    </div>

                    {/* Ders Bazlı İlerleme Çubukları */}
                    {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {weeklyAnalytics.subjectBreakdown.map((sub, i) => {
                          return (
                            <div key={sub.subject} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-[#0f172a]">{sub.subject}</span>
                                <span className="font-bold text-orange-600">
                                  {sub.count} Soru (%{sub.percentage})
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${
                                    i === 0 ? 'bg-[#0f172a]' : i === 1 ? 'bg-orange-500' : 'bg-[#1e3a8a]'
                                  }`}
                                  style={{ width: `${sub.percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                    )}

                    {/* Pedagojik Değerlendirme Raporu */}
                    <div className="mt-5 p-3.5 bg-[#f8fafc] rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                        <Award className="w-3.5 h-3.5 text-orange-600" />
                        <span>Rehberlik & Başarı Analizi</span>
                      </div>
                      <p className="leading-relaxed text-slate-600">
                        {weeklyAnalytics.statusAssessment.reportSummary}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <button
                      onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                      className="w-full py-2.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-orange-400" />
                      <span>Looker Studio Haftalık Raporunu PDF İndir</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: AYLIK LOOKER STUDIO DASHBOARD                                     */}
          {/* ========================================================================= */}
          {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
            <div className="space-y-6">
              {/* Ay Gezinme ve Öğrenci Kimlik Kartı */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Açılır Pencere ile Ay Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-month-picker-modal"
                    type="button"
                    onClick={() => setIsMonthModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-[#f8fafc] hover:bg-orange-50/60 border border-slate-300 hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    title="Geçmiş ayları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100/80 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">
                          Aylık İnceleme Dönemi
                        </span>
                        {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                          <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                            Aktif Ay
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded-md">
                            Geçmiş Dönem
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                        <span className="hidden xs:inline text-slate-500 font-medium">Analiz Ayı:</span>
                        <span className="text-[#1e3a8a] underline decoration-orange-400/60 decoration-2 underline-offset-2">
                          {monthlyAnalytics.monthLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-slate-200 text-slate-400 group-hover:text-orange-600 flex items-center gap-1 text-xs font-semibold shrink-0">
                      <span className="hidden md:inline text-[11px] text-slate-500 group-hover:text-orange-700 font-medium">
                        Açılır Pencere
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 md:text-slate-400" />
                    </div>
                  </button>

                  {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                    <button
                      id="btn-reset-current-month"
                      type="button"
                      onClick={() => setMonthDate({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                      className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Güncel aya dön"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Güncel Aya Dön</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {activeClass && (
                    <button
                      type="button"
                      onClick={() => setSelectedStudentId('')}
                      className="px-3 py-2 bg-slate-100 hover:bg-orange-50 hover:border-orange-300 text-slate-700 hover:text-orange-900 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Sınıfın bütün öğrencilerini ve başarı sıralamasını gör"
                    >
                      <Users className="w-3.5 h-3.5 text-orange-600" />
                      <span>{activeClass.name} Sınıfının Tümünü Göster ({classStudents.length})</span>
                    </button>
                  )}
                  <div className="flex items-center gap-3 bg-[#f8fafc] px-4 py-2 rounded-xl border border-slate-200">
                    <div className="w-8 h-8 rounded-full bg-[#0f172a] text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
                      {activeStudent.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-[#0f172a] block">{activeStudent.name}</span>
                      {activeStudent.className && (
                        <span className="text-[10px] text-slate-400 block">{activeStudent.className}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Aylık Executive KPI Scorecards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ayda Çözülen Toplam Soru */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Aylık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {monthlyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Soru</span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Haftalık Ortalama: <strong className="text-slate-800">{monthlyAnalytics.weeklyAverage} soru</strong>
                  </div>
                </div>

                {/* 2. Aylık Hedef Tamamlama Oranı */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Aylık Müfredat Hedefi</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Target className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-orange-600 tracking-tight">
                      %{monthlyTargetCompletionRate}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Tamamlandı</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="bg-orange-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, monthlyTargetCompletionRate)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Aylık Hedef: <strong>{monthlyTargetTotal} Soru</strong>
                  </div>
                </div>

                {/* 3. Aktif Soru Çözülen Günler */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Aktif Çalışma Günleri</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {monthlyAnalytics.activeDaysCount}
                      <span className="text-base text-slate-400 font-semibold"> Gün</span>
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Aylık Düzenlilik: <strong className="text-slate-800">%{Math.round((monthlyAnalytics.activeDaysCount / 30) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Geçmiş Aya Göre İlerleme Durumu */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Geçmiş Aya Göre Gelişim</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    {monthlyAnalytics.monthlyDifference >= 0 ? (
                      <span className="text-2xl font-black text-emerald-700">
                        +{monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    ) : (
                      <span className="text-2xl font-black text-rose-700">
                        {monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Önceki Ay: <strong className="text-slate-800">{monthlyAnalytics.previousMonthTotal} soru</strong> ({monthlyAnalytics.monthlyGrowthRate >= 0 ? '+' : ''}%{monthlyAnalytics.monthlyGrowthRate})
                  </div>
                </div>
              </div>

              {/* Aylık Hafta Bazında Soru Çözüm Grafiği */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                  <div>
                    <h4 className="text-base font-bold text-[#0f172a] tracking-tight">
                      Aylık Hafta Bazında Soru Çözüm ve Başarı Grafiği
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {monthlyAnalytics.monthLabel} ayı süresince haftalık toplam çözülen soru sayıları
                    </p>
                  </div>
                </div>

                <div className="h-80 w-full bg-[#f8fafc] rounded-xl p-3 border border-slate-200/80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyAnalytics.weeks}
                      margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="weekLabel"
                        stroke="#475569"
                        fontSize={12}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        stroke="#475569"
                        fontSize={12}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <Tooltip content={renderLookerTooltip} />
                      <Bar
                        dataKey="totalQuestions"
                        fill="#1e3a8a"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={60}
                      >
                        <LabelList
                          dataKey="totalQuestions"
                          position="top"
                          fill="#0f172a"
                          fontSize={12}
                          fontWeight={800}
                          offset={8}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Aylık Veri Tablosu & Ders Dağılımı */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-[#0f172a] mb-3 pb-2 border-b border-slate-100">
                    Haftalık Soru Çözüm Dökümü Tablosu
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5">Hafta / Tarih Aralığı</th>
                          <th className="px-3.5 py-2.5 text-center">Haftalık Soru Sayısı</th>
                          <th className="px-3.5 py-2.5 text-center">Aktif Gün</th>
                          <th className="px-3.5 py-2.5">Ağırlıklı Ders</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthlyAnalytics.weeks.map((w) => (
                          <tr key={w.weekIndex} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3.5 py-2.5 font-bold text-[#0f172a]">{w.weekLabel}</td>
                            <td className="px-3.5 py-2.5 text-center font-extrabold text-[#1e3a8a] text-sm">
                              {w.totalQuestions} Soru
                            </td>
                            <td className="px-3.5 py-2.5 text-center text-slate-700 font-semibold">{w.activeDaysCount} Gün</td>
                            <td className="px-3.5 py-2.5 font-medium text-orange-600">{w.topSubject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-[#0f172a] mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-orange-600" />
                      Aylık Ders Dağılım Payları
                    </h4>
                    {monthlyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {monthlyAnalytics.subjectBreakdown.map((sub, i) => (
                          <div key={sub.subject} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[#0f172a]">{sub.subject}</span>
                              <span className="font-bold text-orange-600">
                                {sub.count} Soru (%{sub.percentage})
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${
                                  i === 0 ? 'bg-[#0f172a]' : i === 1 ? 'bg-orange-500' : 'bg-[#1e3a8a]'
                                }`}
                                style={{ width: `${sub.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Ders dökümü bulunamadı.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <button
                      onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                      className="w-full py-2.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-orange-400" />
                      <span>Looker Studio Aylık Raporunu PDF İndir</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: SINIF GENEL BAŞARI SIRALAMASI VE KARŞILAŞTIRMA TABLOSU             */}
          {/* ========================================================================= */}
          {activeAnalysisMode === 'class_overview' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-[#0f172a]">
                    {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm & Başarı Sıralaması
                  </h3>
                  <p className="text-xs text-slate-500">
                    Haftalık ve aylık toplam çözülen soru sayıları, soru çözülmeyen gün alarmları ve başarı dereceleri
                  </p>
                </div>
                <div className="text-xs font-bold text-[#0f172a] bg-[#f8fafc] px-3 py-1.5 rounded-lg border border-slate-200">
                  Toplam {classOverviewData.length} Öğrenci
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Sıra</th>
                      <th className="px-4 py-3">Öğrenci Adı</th>
                      <th className="px-4 py-3 text-center">Bu Hafta Çözülen</th>
                      <th className="px-4 py-3 text-center">Soru Çözülmeyen Günler</th>
                      <th className="px-4 py-3 text-center">Haftalık İlerleme</th>
                      <th className="px-4 py-3 text-center">Bu Ay Toplam</th>
                      <th className="px-4 py-3 text-center">Başarı Seviyesi</th>
                      <th className="px-4 py-3 text-right">Analiz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classOverviewData.map((row, idx) => (
                      <tr
                        key={row.student.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          row.student.id === selectedStudentId ? 'bg-orange-50/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-[#0f172a]">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="hover:text-orange-600 text-left transition-colors cursor-pointer"
                          >
                            {row.student.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-[#0f172a] text-sm">
                          {row.weeklyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.unsolvedDaysCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                              {row.unsolvedDaysCount} Gün Çözülmedi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Her Gün Çözüldü
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">
                          <span className={row.weeklyDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} ({row.weeklyGrowthRate >= 0 ? '+' : ''}%{row.weeklyGrowthRate})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-[#1e3a8a]">
                          {row.monthlyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#f8fafc] text-[#0f172a] border border-slate-200">
                            {row.badgeText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="px-3 py-1 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Analiz Aç
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* GEÇMİŞ HAFTA SEÇİMİ AÇILIR PENCERESİ (POPUP MODAL)                        */}
      {/* ========================================================================= */}
      {isWeekModalOpen && activeStudent && (
        <div
          id="modal-week-picker-backdrop"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsWeekModalOpen(false);
            }
          }}
        >
          <div
            id="modal-week-picker-content"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                    <span>Geçmiş Hafta Seçimi</span>
                    <span className="text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                      Açılır Pencere
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <strong className="text-slate-700">{activeStudent.name}</strong> öğrencisinin geçmiş haftalarda çözdüğü soruları incelemek için dilediğiniz haftayı seçin.
                  </p>
                </div>
              </div>
              <button
                id="btn-close-week-modal"
                onClick={() => setIsWeekModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Filter & Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-[#f8fafc] space-y-3">
              {/* Hızlı Atlama Düğmeleri */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hızlı Seç:</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(0);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === 0
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Bu Hafta (Güncel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-1);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -1
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Geçen Hafta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-2);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -2
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  2 Hafta Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-3);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -3
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  3 Hafta Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-4);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -4
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  1 Ay Önce (4. Hafta)
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={weekSearchQuery}
                    onChange={(e) => setWeekSearchQuery(e.target.value)}
                    placeholder="Hafta veya ay ara (Örn: Eylül, Ağustos)..."
                    className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                  {weekSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setWeekSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-300 shrink-0">
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      weekFilterTab === 'all'
                        ? 'bg-[#0f172a] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tümü ({pastWeeksList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('with_questions')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                      weekFilterTab === 'with_questions'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Soru Çözülenler</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white">
                      {activeWeeksCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Hafta Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aramanıza veya seçtiğiniz filtreye uygun hafta bulunamadı.
                </div>
              ) : (
                filteredPastWeeks.map((item) => {
                  const isSelected = item.offset === weekOffset;
                  return (
                    <div
                      key={item.offset}
                      onClick={() => {
                        setWeekOffset(item.offset);
                        setIsWeekModalOpen(false);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50/70 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-[#0f172a] text-orange-400'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {item.offset === 0 ? '0' : item.offset}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-orange-950' : 'text-[#0f172a]'
                              }`}
                            >
                              {item.weekLabel}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                item.offset === 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isSelected
                                  ? 'bg-orange-200 text-orange-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {formatTurkishDate(item.startDateStr)} - {formatTurkishDate(item.endDateStr)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-[#0f172a] flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-[10px] text-emerald-600 font-semibold block">
                                {item.activeDaysCount} gün soru girişi yapıldı
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              Soru kaydı yok (0)
                            </span>
                          )}
                        </div>

                        <div>
                          {isSelected ? (
                            <span className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs">
                              <Check className="w-3.5 h-3.5" />
                              <span>Seçili</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="px-3 py-1.5 bg-white hover:bg-[#0f172a] text-slate-700 hover:text-white border border-slate-300 hover:border-[#0f172a] text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                              İncele
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <Sparkles className="w-4 h-4 text-orange-500 shrink-0" />
                <span>Hafta seçildiğinde Looker Studio grafikleri, başarı analizi ve PDF raporları anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekOffset(0);
                      setIsWeekModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-orange-600" />
                    <span>Güncel Haftaya Git</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWeekModalOpen(false)}
                  className="px-4 py-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* GEÇMİŞ AYLARI İNCELEME AÇILIR PENCERESİ (LOOKER STUDIO MODAL)               */}
      {/* ========================================================================= */}
      {isMonthModalOpen && activeStudent && (
        <div
          id="month-picker-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsMonthModalOpen(false);
            }
          }}
        >
          <div
            id="month-picker-modal-content"
            className="w-full max-w-2xl bg-white border border-slate-300 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Başlık */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                      Açılır Pencere
                    </span>
                    <span className="text-xs text-slate-300 font-medium">
                      Öğrenci: <strong className="text-white">{activeStudent.name}</strong>
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Geçmiş Ayları ve Çözülen Soruları İncele
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Kapat (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hızlı Filtre & Arama Bölümü */}
            <div className="p-4 bg-[#f8fafc] border-b border-slate-200 space-y-3 shrink-0">
              {/* Hızlı Butonlar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-slate-400 text-[11px] font-bold shrink-0">Hızlı Dönem:</span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Bu Ay (Güncel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  Geçen Ay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  2 Ay Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  3 Ay Önce
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={monthSearchQuery}
                    onChange={(e) => setMonthSearchQuery(e.target.value)}
                    placeholder="Ay veya yıl ara (Örn: Eylül, 2026)..."
                    className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                  {monthSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMonthSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-300 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      monthFilterTab === 'all'
                        ? 'bg-[#0f172a] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tümü ({pastMonthsList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('with_questions')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                      monthFilterTab === 'with_questions'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Soru Çözülenler</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white">
                      {activeMonthsCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Ay Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastMonths.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aramanıza veya seçtiğiniz filtreye uygun ay bulunamadı.
                </div>
              ) : (
                filteredPastMonths.map((item) => {
                  const isSelected = item.year === monthDate.year && item.month === monthDate.month;
                  return (
                    <div
                      key={`${item.year}-${item.month}`}
                      onClick={() => {
                        setMonthDate({ year: item.year, month: item.month });
                        setIsMonthModalOpen(false);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50/70 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-[#0f172a] text-orange-400'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {item.month + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-orange-950' : 'text-[#0f172a]'
                              }`}
                            >
                              {item.monthLabel}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                item.year === new Date().getFullYear() && item.month === new Date().getMonth()
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isSelected
                                  ? 'bg-orange-200 text-orange-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {item.year} Yılı • {TURKISH_MONTHS[item.month]} Dönemi
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-[#0f172a] flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-[10px] text-emerald-600 font-semibold block">
                                {item.activeDaysCount} aktif çalışma günü
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              Soru kaydı yok (0)
                            </span>
                          )}
                        </div>

                        <div>
                          {isSelected ? (
                            <span className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs">
                              <Check className="w-3.5 h-3.5" />
                              <span>Seçili</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="px-3 py-1.5 bg-white hover:bg-[#0f172a] text-slate-700 hover:text-white border border-slate-300 hover:border-[#0f172a] text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                              İncele
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <Sparkles className="w-4 h-4 text-orange-500 shrink-0" />
                <span>Ay seçildiğinde aylık Looker Studio grafikleri, başarı oranları ve aylık PDF anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                      setIsMonthModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-orange-600" />
                    <span>Güncel Aya Git</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMonthModalOpen(false)}
                  className="px-4 py-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Haftalık Soru Hedefi Belirleme Modalı */}
      {isWeeklyTargetModalOpen && activeStudent && (
        <WeeklyTargetModal
          isOpen={isWeeklyTargetModalOpen}
          onClose={() => {
            setIsWeeklyTargetModalOpen(false);
            setTargetUpdateTrigger((prev) => prev + 1);
          }}
          student={activeStudent}
          weekStartDate={currentWeekStartDate}
          weekEndDate={currentWeekEndDate}
          existingTarget={activeWeeklyTarget}
        />
      )}

      {/* ========================================================================= */}
      {/* ÖĞRETMEN TEBRİK VE AFERİN BİLDİRİMİ GÖNDERME MODALI                     */}
      {/* ========================================================================= */}
      {praiseTargetDay && activeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-amber-200 relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#0f172a]">
                    Öğrenciye Tebrik ve Aferin Gönder
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeStudent.name} • {formatTurkishDate(praiseTargetDay.dateStr)} ({praiseTargetDay.dayName})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPraiseTargetDay(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Performans Özeti Rozeti */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 mb-4 text-xs text-amber-950 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                  Günlük Çözülen Soru
                </span>
                <span className="text-lg font-black text-amber-900">
                  {praiseTargetDay.totalQuestions} Soru
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                  Ders Dağılımı
                </span>
                <span className="text-xs font-semibold text-amber-900 truncate max-w-[200px] block">
                  {praiseTargetDay.subjectsText || 'Genel Çözüm'}
                </span>
              </div>
            </div>

            {/* Hızlı Tebrik Şablonları */}
            <div className="space-y-1.5 mb-3">
              <label className="text-[11px] font-bold text-[#334155] block">
                ⚡ Hızlı Tebrik Şablonu Seçin:
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  `Harikasın ${activeStudent.name}! 👏 Bugünkü ${praiseTargetDay.totalQuestions} soruluk hedefini başarıyla tamamladığın ve gösterdiğin gayret için seni tebrik ederim, aynen devam!`,
                  `Aferin ${activeStudent.name}! ⭐ Soru çözümlerin ve disiplinli çalışman için seni tebrik ederim, harika gidiyorsun!`,
                  `Süpersin! 🚀 Günlük ${praiseTargetDay.totalQuestions} soru çözerek hedefini aştın. Bu disiplin ve kararlılık seni hedeflerine ulaştıracak!`,
                  `Tebrikler ${activeStudent.name}! 🎯 Bugünkü soru çözüm performansın ve azmin takdire şayan. Seninle gurur duyuyorum!`,
                ].map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPraiseCustomMessage(tpl)}
                    className={`text-left text-[11px] p-2 rounded-lg border transition-colors cursor-pointer ${
                      praiseCustomMessage === tpl
                        ? 'bg-amber-100/80 border-amber-400 font-bold text-amber-950 ring-1 ring-amber-400'
                        : 'bg-slate-50 hover:bg-amber-50/50 border-slate-200 text-slate-700'
                    }`}
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>

            {/* Özelleştirilebilir Mesaj Kutusu */}
            <div className="mb-4">
              <label className="text-[11px] font-bold text-[#334155] block mb-1">
                İletilecek Bildirim Mesajı:
              </label>
              <textarea
                rows={3}
                value={praiseCustomMessage}
                onChange={(e) => setPraiseCustomMessage(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-[#0f172a] font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="Öğrenciye iletilecek tebrik mesajını yazınız..."
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                ℹ️ Bu bildirim öğrencinin ana ekranında (portalında) tebrik kartı olarak anında gösterilecektir.
              </span>
            </div>

            {/* Modal Butonları */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPraiseTargetDay(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSendPraise}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>Öğrenciye Tebrik Bildirimi Gönder 🚀</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Başarı Toast Bildirimi */}
      {praiseSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0f172a] text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/40 flex items-center space-x-2.5 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{praiseSuccessToast}</span>
        </div>
      )}
    </div>
  );
};
