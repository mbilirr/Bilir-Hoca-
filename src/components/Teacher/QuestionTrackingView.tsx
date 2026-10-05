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
  Trash2,
  ListOrdered,
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
import { WeeklyTargetModal, TargetFormSaved } from './WeeklyTargetModal';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { MailNoticeBar } from './FormParts';
import { periodOf, targetPeriodText, ownerText } from './TargetListParts';
import { StudentTargetCards } from '../Student/StudentTargetCards';
import {
  generalDailyTarget,
  computeMonthlyTargetPlan,
  useTodayIso,
  useIsNarrowScreen,
  shortTurkishDate,
  parseIsoDate,
  TargetLineLabel,
  WeeklyChartLegend,
  MonthlyBucketTooltip,
  CHART_BAR_CURSOR,
  CHART_LINE_CURSOR,
  CHART_COLORS,
} from '../Student/StudentQuestionModule';
import { StudentTargetsModal } from './StudentTargetsModal';
import { ClassTargetsModal } from './ClassTargetsModal';
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

  // Grafik görselleştirme tipi: 'bar' (Sütun Grafiği) | 'area' (Trend & Alan)
  const [chartVisualType, setChartVisualType] = useState<'bar' | 'area'>('bar');

  // Soru hedefi penceresi (Aşama 10): her açılışta ne açılacağı açıkça belirlenir
  const [targetForm, setTargetForm] = useState<{
    open: boolean;
    editTarget?: WeeklyQuestionTarget | null;
    presetKind?: 'student' | 'class';
    presetStudentId?: string;
    presetClassId?: string;
  }>({ open: false });
  const [targetUpdateTrigger, setTargetUpdateTrigger] = useState<number>(0);
  const [mailNotice, setMailNotice] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null>(null);

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
  const [isManageLogsModalOpen, setIsManageLogsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
    return unsub;
  }, []);

  // Yerel "bugün": pencere odaklanınca / görünür olunca ve her dakika yenilenir (gece yarısı sonrası eskimez)
  const todayIsoStr = useTodayIso();
  const isNarrow = useIsNarrowScreen();

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
    const d = parseIsoDate(todayIsoStr) || new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset, todayIsoStr]);

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

  // Bu haftaya denk gelen hedefler (önce benim verdiğim). Başka haftanın hedefi gösterilmez.
  const activeTargets = useMemo(() => {
    if (!activeStudent) return [] as WeeklyQuestionTarget[];
    return dataService.getQuestionTargetsForStudent(activeStudent.id, currentWeekStartDate, currentWeekEndDate);
  }, [activeStudent, currentWeekStartDate, currentWeekEndDate, targetUpdateTrigger, allLogs]);
  const activeWeeklyTarget = activeTargets[0] || null;
  const myActiveTarget = activeTargets.find((t) => dataService.isMyQuestionTarget(t) && dataService.canEditQuestionTarget(t)) || null;
  // Günlük hedef çizgisi: bu haftanın GENEL (ders seçilmemiş) hedefinin günlük sayısı, yoksa 50.
  // Ders hedefi (ör. yalnızca Matematik) tüm derslerin toplamıyla karşılaştırılmaz. Öğrenci ekranıyla aynı kural.
  // ("Soru Hedefi" kartı ise activeWeeklyTarget'ı göstermeye devam eder.)
  const dailyQuestionTarget = generalDailyTarget(activeTargets);
  const activeTargetProgress = useMemo(
    () => (activeStudent && activeWeeklyTarget ? dataService.questionTargetProgress(activeWeeklyTarget, activeStudent.id, allLogs) : null),
    [activeStudent, activeWeeklyTarget, allLogs]
  );

  // Hedef listeleri
  const [isStudentTargetsModalOpen, setIsStudentTargetsModalOpen] = useState<boolean>(false);
  const [isClassTargetsModalOpen, setIsClassTargetsModalOpen] = useState<boolean>(false);

  const studentTargetsCount = useMemo(() => {
    return dataService.getStudentQuestionTargets().filter((t) => periodOf(t) === 'active').length;
  }, [targetUpdateTrigger, allLogs, students]);

  const classTargetsCount = useMemo(() => {
    return dataService.getClassQuestionTargets().filter((t) => periodOf(t) === 'active').length;
  }, [targetUpdateTrigger, allLogs, classes]);

  const openNewTarget = (kind: 'student' | 'class', studentId?: string, classId?: string) =>
    setTargetForm({ open: true, editTarget: null, presetKind: kind, presetStudentId: studentId, presetClassId: classId });
  const openEditTarget = (t: WeeklyQuestionTarget) => setTargetForm({ open: true, editTarget: t });

  // Öğrenci kartındaki "Hedef" düğmesi: bu hafta benim hedefim varsa onu düzenle, yoksa yeni hedef
  const handleOpenStudentTargetModal = (st?: Student | null) => {
    const student = st || activeStudent || null;
    if (student && student.id === activeStudent?.id && myActiveTarget) return openEditTarget(myActiveTarget);
    openNewTarget('student', student?.id, student?.classId);
  };

  const handleOpenClassTargetModal = (cls?: ClassGroup | null) => {
    const targetC = cls || (activeClass && activeClass.id !== 'all' ? activeClass : null);
    openNewTarget('class', undefined, targetC?.id);
  };

  const handleTargetSaved = (r: TargetFormSaved) => {
    setTargetForm({ open: false });
    setTargetUpdateTrigger((prev) => prev + 1);
    if (r.sendMail && r.changed && r.target.id) {
      setMailNotice({ tone: 'info', text: 'Öğrencilere e-posta gönderiliyor…' });
      callMail('question-target', { targetId: r.target.id, mode: r.isNew ? 'new' : 'updated' }).then((res) => setMailNotice(describeMailResult(res)));
    } else if (r.sendMail && !r.changed) {
      setMailNotice({ tone: 'info', text: 'Hedefte değişiklik olmadığı için e-posta gönderilmedi.' });
    } else {
      setMailNotice(null);
    }
  };

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
  }, [allLogs, activeStudent?.id, todayIsoStr]);

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
  }, [allLogs, activeStudent?.id, todayIsoStr]);

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
        prevWeekTotal: stWeekly.previousWeekTotal,
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
  // Hedef varsa kendi tarihleri (ve dersi) içindeki çözümler sayılır; yoksa bu hafta / varsayılan 50×7
  const weeklyTargetTotal = activeTargetProgress ? activeTargetProgress.total : dailyQuestionTarget * 7;
  const weeklyTargetSolved = activeTargetProgress ? activeTargetProgress.solved : weeklyAnalytics?.totalQuestions || 0;
  const weeklyTargetCompletionRate = useMemo(() => {
    if (weeklyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((weeklyTargetSolved / weeklyTargetTotal) * 100));
  }, [weeklyTargetSolved, weeklyTargetTotal]);

  // Aylık hedef: seçilen ayın her günü için o haftanın genel hedefi (yoksa 50) toplanır (öğrenci ekranıyla aynı)
  const monthlyPlan = useMemo(
    () => computeMonthlyTargetPlan(activeStudent?.id || '', monthDate.year, monthDate.month),
    [activeStudent?.id, monthDate, allLogs, targetUpdateTrigger]
  );
  const monthlyTargetTotal = monthlyPlan.total;
  const monthlyTargetCompletionRate = useMemo(() => {
    if (!monthlyAnalytics || monthlyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((monthlyAnalytics.totalQuestions / monthlyTargetTotal) * 100));
  }, [monthlyAnalytics, monthlyTargetTotal]);

  // Looker Studio Custom Tooltip Component (Temiz Beyaz Arka Plan & Koyu Gri Metinler & Canlı Turuncu)
  const renderLookerTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface border border-line shadow-xl rounded-xl p-3.5 text-xs text-fg space-y-1.5 z-50 min-w-[210px]">
          <div className="flex items-center justify-between border-b border-line pb-1.5">
            <span className="font-bold text-fg text-xs">
              {data.dayName ? `${data.dayName} (${formatTurkishDate(data.dateStr)})` : data.weekLabel}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30">
              {data.totalQuestions > 0 ? `${data.totalQuestions} Soru` : '0 Soru'}
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-muted">
              <span>Toplam Çözülen:</span>
              <strong className="text-fg font-bold text-xs">{data.totalQuestions} Soru</strong>
            </div>

            {data.totalCorrect !== undefined && data.totalCorrect > 0 && (
              <div className="flex justify-between items-center text-muted">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Doğru:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">{data.totalCorrect}</span>
              </div>
            )}

            {data.totalWrong !== undefined && data.totalWrong > 0 && (
              <div className="flex justify-between items-center text-muted">
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Yanlış:
                </span>
                <span className="font-bold text-rose-700 dark:text-rose-300">{data.totalWrong}</span>
              </div>
            )}

            {data.totalQuestions >= dailyQuestionTarget ? (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-300 font-semibold flex items-center gap-1 pt-1 border-t border-line">
                <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                <span>Günlük Hedefe Ulaşıldı (%{Math.round((data.totalQuestions / dailyQuestionTarget) * 100)})</span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-[11px] text-orange-600 dark:text-orange-300 font-medium pt-1 border-t border-line">
                Hedefe {dailyQuestionTarget - data.totalQuestions} soru kaldı
              </div>
            ) : (
              <div className="text-[11px] text-rose-600 dark:text-rose-300 font-medium flex items-center gap-1 pt-1 border-t border-line">
                <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                <span>Bu gün soru çözülmedi</span>
              </div>
            )}

            {data.subjectsText && (
              <div className="pt-1 border-t border-line text-[10px] text-muted truncate max-w-[200px]">
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
      {mailNotice && <MailNoticeBar notice={mailNotice} onClose={() => setMailNotice(null)} />}
      {/* ========================================================================= */}
      {/* GOOGLE LOOKER STUDIO - EXECUTIVE CONTROL BAR & APP HEADER               */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
        {/* Top Looker Studio Header Brand */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning-soft text-warning-fg flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">Soru Takibi</h1>
              <p className="text-sm text-muted mt-0.5">Çözülen soru sayıları, hedefler ve başarı analizi</p>
            </div>
          </div>

          {/* Target Menus & Quick Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Öğrenci Hedefleri Açılır Butonu */}
            <button
              type="button"
              id="btn-open-student-targets"
              onClick={() => setIsStudentTargetsModalOpen(true)}
              className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Kayıtlı öğrenci soru hedeflerini görüntüle ve yönet"
            >
              <User className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span>Öğrenci Hedefleri</span>
              {studentTargetsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-orange-500 text-white">
                  {studentTargetsCount}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-orange-700/70 dark:text-orange-400/70" />
            </button>

            {/* 2. Sınıf Hedefleri Açılır Butonu */}
            <button
              type="button"
              id="btn-open-class-targets"
              onClick={() => setIsClassTargetsModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Kayıtlı sınıf toplu soru hedeflerini görüntüle ve yönet"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Sınıf Hedefleri</span>
              {classTargetsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                  {classTargetsCount}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-indigo-600/70 dark:text-indigo-400/70" />
            </button>

            {/* Soru Hedefi Belirleme Butonu */}
            <button
              type="button"
              id="btn-set-weekly-target"
              onClick={() => {
                if (activeStudent) {
                  handleOpenStudentTargetModal(activeStudent);
                } else if (activeClass && activeClass.id !== 'all') {
                  handleOpenClassTargetModal(activeClass);
                } else {
                  openNewTarget('student');
                }
              }}
              className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-orange-500/20 cursor-pointer"
              title="Soru sayısı hedefi belirle"
            >
              <Target className="w-3.5 h-3.5" />
              <span>
                {activeStudent
                  ? myActiveTarget
                    ? `Hedef: ${myActiveTarget.targetQuestions} Soru (Düzenle)`
                    : '🎯 Öğrenci Hedefi Ver'
                  : activeClass && activeClass.id !== 'all'
                  ? '🎯 Sınıfa Toplu Hedef Ver'
                  : '🎯 Soru Hedefi Belirle'}
              </span>
            </button>

            {activeStudent && (
              <>
                {/* Soru Kayıtları & Geçmiş Yönetimi Butonu */}
                <button
                  type="button"
                  id="btn-manage-question-logs"
                  onClick={() => setIsManageLogsModalOpen(true)}
                  className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer border border-line"
                  title="Öğrencinin tüm kayıtlı soru girişlerini listele ve yönet"
                >
                  <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Soru Kayıtlarını Yönet</span>
                </button>

                {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
                  <button
                    id="btn-looker-pdf-weekly"
                    onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                    className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Haftalık Raporu İndir (PDF)</span>
                  </button>
                )}
                {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
                  <button
                    id="btn-looker-pdf-monthly"
                    onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                    className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
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
          <div className="bg-surface-2 p-3 rounded-xl border border-line">
            <label className="block text-[11px] font-bold text-fg-2 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#1e3a8a] dark:text-blue-200" />
                Sınıf Filtresi
              </span>
              {selectedClassId && (
                <button
                  type="button"
                  onClick={() => handleSelectClass('')}
                  className="text-[10px] text-muted hover:text-rose-600 dark:hover:text-rose-300 font-semibold cursor-pointer"
                >
                  Sınıfı Temizle ✕
                </button>
              )}
            </label>
            <select
              id="looker-filter-class"
              value={selectedClassId}
              onChange={(e) => handleSelectClass(e.target.value)}
              className="w-full bg-surface border border-line-strong text-xs font-semibold text-fg rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
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
          <div className="bg-surface-2 p-3 rounded-xl border border-line relative" ref={studentDropdownRef}>
            <label className="block text-[11px] font-bold text-fg-2 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                Öğrenci Seçimi
              </span>
              {selectedStudentId && (
                <button
                  type="button"
                  onClick={() => setSelectedStudentId('')}
                  className="text-[10px] text-muted hover:text-rose-600 dark:hover:text-rose-300 font-semibold cursor-pointer"
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
              className="w-full bg-surface border border-line-strong text-xs rounded-lg px-3 py-1.5 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer text-left shadow-2xs hover:border-line-strong transition-colors"
            >
              {activeStudent ? (
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`font-bold ${
                      getStudentTodayQuestionCount(activeStudent.id) > 0
                        ? 'text-emerald-700 dark:text-emerald-300 font-black'
                        : 'text-fg'
                    }`}
                  >
                    {activeStudent.name}
                  </span>
                  {activeStudent.className && (
                    <span className="text-[10px] text-subtle truncate">
                      ({activeStudent.className})
                    </span>
                  )}
                  {getStudentTodayQuestionCount(activeStudent.id) > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500/30">
                      🎯 {getStudentTodayQuestionCount(activeStudent.id)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted font-medium">Öğrenci Seçiniz</span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-subtle shrink-0 transition-transform ${
                  isStudentDropdownOpen ? 'rotate-180 text-orange-700 dark:text-orange-400' : ''
                }`}
              />
            </button>

            {/* Açılır Arama ve Öğrenci Seçim Paneli */}
            {isStudentDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-surface border border-line-strong rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in duration-100">
                {/* En üstteki Yapışkan Arama Kutusu */}
                <div className="p-2 border-b border-line bg-surface-2 sticky top-0 z-20 space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-subtle absolute left-2.5 top-2.5" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Öğrenci ara (büyük/küçük harf duyarsız)..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 bg-surface border border-line-strong rounded-lg text-xs font-semibold text-fg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    />
                    {studentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setStudentSearchQuery('')}
                        className="absolute right-2 top-2 text-subtle hover:text-muted cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Kapsam Filtresi: Eğer sınıf seçilmişse sınıf içi veya tüm okul toggle'ı */}
                  {selectedClassId && selectedClassId !== 'all' && (
                    <div className="flex rounded-md bg-surface-3/80 p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDropdownScope('class')}
                        className={`flex-1 py-1 rounded transition-colors ${
                          dropdownScope === 'class'
                            ? 'bg-surface text-orange-700 dark:text-orange-300 shadow-2xs font-extrabold'
                            : 'text-muted hover:text-fg'
                        }`}
                      >
                        {activeClass?.name || 'Sınıf'} ({classStudents.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDropdownScope('all')}
                        className={`flex-1 py-1 rounded transition-colors ${
                          dropdownScope === 'all'
                            ? 'bg-surface text-orange-700 dark:text-orange-300 shadow-2xs font-extrabold'
                            : 'text-muted hover:text-fg'
                        }`}
                      >
                        Tüm Okul ({students.length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Seçim Seçenekleri */}
                <div className="overflow-y-auto divide-y divide-line flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId('');
                      setIsStudentDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-2 flex items-center justify-between cursor-pointer"
                  >
                    <span>Öğrenci Seçiniz (Seçimi Temizle)</span>
                    {!selectedStudentId && <Check className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />}
                  </button>

                  {filteredDropdownStudents.length === 0 ? (
                    <div className="py-6 text-center text-xs text-subtle">
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
                                ? 'bg-emerald-100/90 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-200 font-black border-l-4 border-emerald-600'
                                : 'bg-emerald-50/70 dark:bg-emerald-500/10 hover:bg-emerald-100/70 dark:hover:bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-l-4 border-emerald-500'
                              : isSelected
                              ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-950 dark:text-orange-200 font-bold'
                              : 'hover:bg-surface-2 text-fg-2'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`truncate ${
                                hasSolvedToday
                                  ? 'text-emerald-700 dark:text-emerald-300 font-extrabold flex items-center gap-1.5'
                                  : 'font-semibold'
                              }`}
                            >
                              {hasSolvedToday && (
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                              )}
                              {s.name}
                            </span>
                            {s.className && (
                              <span className="text-[10px] text-subtle shrink-0">
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
                            {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />}
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
          <div className="bg-surface-2 p-3 rounded-xl border border-line">
            <label className="block text-[11px] font-bold text-fg-2 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#1e3a8a] dark:text-blue-200" />
              Analiz Boyutu
            </label>
            <div className="flex rounded-lg bg-surface border border-line-strong p-0.5">
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('weekly')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'weekly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Haftalık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('monthly')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'monthly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Aylık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('class_overview')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'class_overview'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
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
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0 shadow-xs">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-500/30">
                        Bütün Sınıf Raporu
                      </span>
                      <span className="text-xs font-semibold text-muted">
                        {classStudents.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-fg tracking-tight mt-0.5">
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
                    className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-fg-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="Sınıf seçimini temizle"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Sınıfı Kapat</span>
                  </button>
                </div>
              </div>

              {/* Sınıf Genel KPI Kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4">
                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Sınıf Mevcudu</span>
                    <Users className="w-4 h-4 text-[#1e3a8a] dark:text-blue-200" />
                  </div>
                  <div className="text-2xl font-black text-fg">
                    {classStudents.length} <span className="text-xs font-normal text-muted">Öğrenci</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">
                    Bugün {classSummaryStats.todaySolvedCount} öğrenci soru girişi yaptı
                  </div>
                </div>

                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Bu Hafta Sınıf Toplamı</span>
                    <BarChart3 className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                  </div>
                  <div className="text-2xl font-black text-orange-600 dark:text-orange-300">
                    {classSummaryStats.weeklyTotal} <span className="text-xs font-normal text-muted">Soru</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    Haftalık sınıf geneli çözülen toplam
                  </div>
                </div>

                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Öğrenci Başına Haftalık Ortalama</span>
                    <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    {classSummaryStats.weeklyAvgPerStudent} <span className="text-xs font-normal text-muted">Soru</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    Günlük ortalama ~{classSummaryStats.dailyAvgPerStudent} soru
                  </div>
                </div>

                <div className="bg-surface-2 p-4 rounded-xl border border-line">
                  <div className="flex items-center justify-between text-xs text-muted font-semibold mb-1">
                    <span>Bu Ay Sınıf Toplamı</span>
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div className="text-2xl font-black text-purple-700 dark:text-purple-300">
                    {classSummaryStats.monthlyTotal} <span className="text-xs font-normal text-muted">Soru</span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    Aylık genel sınıf soru hacmi
                  </div>
                </div>
              </div>
            </div>

            {/* Sınıfın Tüm Öğrencilerinin Soru Çözüm Sıralaması Tablosu */}
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-bold text-fg flex items-center gap-2">
                    <span>{activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Başarı & Soru Sıralaması</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-fg-2">
                      {classOverviewData.length} Öğrenci
                    </span>
                  </h3>
                </div>
              </div>

              {classOverviewData.length === 0 ? (
                <div className="py-12 text-center text-xs text-subtle">
                  Bu sınıfta henüz kayıtlı öğrenci bulunmuyor.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
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
                    <tbody className="divide-y divide-line">
                      {classOverviewData.map((row, idx) => {
                        const todayCount = getStudentTodayQuestionCount(row.student.id);
                        return (
                          <tr
                            key={row.student.id}
                            className="hover:bg-orange-50/40 dark:hover:bg-orange-500/10 transition-colors group cursor-pointer"
                            onClick={() => handleSelectStudent(row.student.id)}
                          >
                            <td className="px-4 py-3.5 font-bold text-muted">
                              {idx === 0 ? (
                                <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 flex items-center justify-center font-black text-[11px]">
                                  🥇
                                </span>
                              ) : idx === 1 ? (
                                <span className="w-6 h-6 rounded-full bg-surface-3 text-fg-2 flex items-center justify-center font-black text-[11px]">
                                  🥈
                                </span>
                              ) : idx === 2 ? (
                                <span className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-200 flex items-center justify-center font-black text-[11px]">
                                  🥉
                                </span>
                              ) : (
                                idx + 1
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-fg group-hover:text-orange-600 dark:group-hover:text-orange-300 transition-colors text-sm">
                                {row.student.name}
                              </div>
                              {row.student.studentNumber && (
                                <div className="text-[10px] text-subtle">
                                  No: {row.student.studentNumber}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {todayCount > 0 ? (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500/30">
                                  🎯 {todayCount} Soru
                                </span>
                              ) : (
                                <span className="text-subtle text-[11px] font-medium">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-fg text-sm">
                              {row.weeklyTotal} Soru
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {row.unsolvedDaysCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-500/30">
                                  {row.unsolvedDaysCount} Gün Boş
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                  Her Gün Çözüldü
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold">
                              <span className={row.weeklyDiff >= 0 ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-rose-700 dark:text-rose-300 font-bold'}>
                                {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} {row.prevWeekTotal > 0 ? `(${row.weeklyGrowthRate >= 0 ? '+' : ''}%${row.weeklyGrowthRate})` : '(önceki hafta kayıt yok)'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-[#1e3a8a] dark:text-blue-200">
                              {row.monthlyTotal} Soru
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-surface-2 text-fg border border-line">
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
                                className="px-3 py-1.5 bg-fg hover:bg-orange-600 text-surface rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
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
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-fg uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                  <span>Sınıf Öğrenci Kartları ({classStudents.length})</span>
                </h4>
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
                      className="p-3.5 rounded-xl border border-line bg-gradient-to-br from-surface to-surface-2 hover:from-orange-50/70 dark:hover:from-orange-500/10 hover:to-amber-50/50 dark:hover:to-amber-500/10 hover:border-orange-300 dark:hover:border-orange-500/30 transition-all text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-extrabold text-xs text-fg group-hover:text-orange-600 dark:group-hover:text-orange-300 transition-colors">
                            {s.name}
                          </div>
                          {s.studentNumber && (
                            <div className="text-[10px] text-subtle">
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
                      <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-line">
                        <span className="font-semibold text-fg-2">Bu Hafta: <strong className="text-orange-600 dark:text-orange-300 font-extrabold">{weeklyTotal} Soru</strong></span>
                        <span className="text-orange-600 dark:text-orange-300 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
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
          <div className="bg-surface border border-line rounded-2xl p-6 sm:p-10 shadow-sm space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300 flex items-center justify-center mx-auto mb-2 shadow-xs">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-fg">
                Lütfen İncelemek İstediğiniz Sınıfı veya Öğrenciyi Seçiniz
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                Yukarıdaki menüden bir <strong>sınıf seçerek bütün sınıfın</strong> soru çözümlerini ve başarı sıralamasını listeleyebilir, veya <strong>öğrenci seçerek</strong> tek bir öğrencinin ayrıntılı analizini inceleyebilirsiniz.
              </p>
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
                  <div className="bg-surface-2 rounded-xl p-6 text-center text-xs text-subtle border border-dashed border-line">
                    Bugün henüz sisteme soru girişi yapan öğrenci bulunmuyor. Yukarıdaki menüden geçmiş günlerin analizini incelemek istediğiniz sınıfı veya öğrenciyi seçebilirsiniz.
                  </div>
                );
              }

              return (
                <div className="space-y-3 pt-4 border-t border-line">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                      <span>Bugün Soru Çözen Öğrenciler ({todaySolvedStudents.length})</span>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {todaySolvedStudents.map(({ student: s, todayQuestions }) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudent(s.id)}
                        className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50/80 dark:from-emerald-500/10 to-teal-50/40 dark:to-teal-500/10 hover:from-emerald-100/90 dark:hover:from-emerald-500/10 hover:to-teal-100/60 dark:hover:to-teal-500/10 transition-all text-left group shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="font-extrabold text-xs text-emerald-950 dark:text-emerald-200 group-hover:text-emerald-800 dark:group-hover:text-emerald-200 transition-colors">
                            {s.name}
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs shrink-0">
                            {todayQuestions} Soru
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-emerald-100/60 dark:border-emerald-500/30">
                          <span className="truncate">{s.className || 'Sınıf Belirtilmedi'}</span>
                          <span className="text-emerald-700 dark:text-emerald-300 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
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
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Açılır Pencere ile Hafta Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-week-picker-modal"
                    type="button"
                    onClick={() => setIsWeekModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-surface-2 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 border border-line-strong hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    title="Geçmiş haftaları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100/80 dark:bg-orange-500/15 group-hover:bg-orange-600 text-orange-600 dark:text-orange-300 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold text-orange-600 dark:text-orange-300 uppercase tracking-wider">
                          {weekOffset === 0 ? 'Güncel Dönem' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                        </span>
                        {weekOffset !== 0 ? (
                          <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                            Geçmiş Hafta
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-1.5 py-0.2 rounded-md">
                            Aktif Hafta
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                        <span className="hidden xs:inline text-muted font-medium">İncelenen Hafta:</span>
                        <span className="text-[#1e3a8a] dark:text-blue-200 underline decoration-orange-400/60 decoration-2 underline-offset-2">
                          {weeklyAnalytics.weekLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-line text-subtle group-hover:text-orange-600 dark:group-hover:text-orange-300 flex items-center gap-1 text-xs font-semibold shrink-0">
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 dark:text-orange-300 md:text-subtle" />
                    </div>
                  </button>

                  {weekOffset !== 0 && (
                    <button
                      id="btn-reset-current-week"
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
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
                      className="px-3 py-2 bg-surface-2 hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:border-orange-300 dark:hover:border-orange-500/30 text-fg-2 hover:text-orange-900 dark:hover:text-orange-200 border border-line rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Sınıfın bütün öğrencilerini ve başarı sıralamasını gör"
                    >
                      <Users className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                      <span>{activeClass.name} Sınıfının Tümünü Göster ({classStudents.length})</span>
                    </button>
                  )}
                  <div className="flex items-center gap-3 bg-surface-2 px-4 py-2 rounded-xl border border-line">
                    <div className="w-8 h-8 rounded-full bg-fg text-orange-700 dark:text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
                      {activeStudent.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-fg block">{activeStudent.name}</span>
                      {activeStudent.className && (
                        <span className="text-[10px] text-subtle block">{activeStudent.className}</span>
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
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Haftalık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-[#1e3a8a] dark:text-blue-200">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-fg tracking-tight">
                      {weeklyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-muted">Soru</span>
                  </div>

                  {/* Deltası */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
                    {weeklyAnalytics.weeklyDifference >= 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        +{weeklyAnalytics.weeklyDifference} soru {weeklyAnalytics.previousWeekTotal > 0 ? `(+%${weeklyAnalytics.weeklyGrowthRate})` : '(önceki hafta kayıt yok)'}
                      </span>
                    ) : (
                      <span className="text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        {weeklyAnalytics.weeklyDifference} soru (%{weeklyAnalytics.weeklyGrowthRate})
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-muted">
                    Önceki Hafta: <strong className="text-fg-2">{weeklyAnalytics.previousWeekTotal} soru</strong>
                  </div>
                </div>

                {/* 2. Soru hedefi (Aşama 10: hedefin kendi tarihleri ve dersi sayılır) */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow" id="active-target-card">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span>Soru Hedefi</span>
                      {activeWeeklyTarget && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded bg-success-soft text-success-fg truncate">
                          {activeWeeklyTarget.subject || 'Tüm dersler'}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenStudentTargetModal(activeStudent)}
                      className="p-1 rounded-lg bg-warning-soft text-warning-fg transition-colors cursor-pointer"
                      title={myActiveTarget ? 'Hedefimi düzenle' : 'Hedef ver'}
                      aria-label={myActiveTarget ? 'Hedefimi düzenle' : 'Hedef ver'}
                    >
                      <Target className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-warning-fg tracking-tight">%{weeklyTargetCompletionRate}</span>
                    <span className="text-xs font-semibold text-muted">
                      {weeklyTargetSolved} / {weeklyTargetTotal} Soru
                    </span>
                  </div>
                  <div className="w-full bg-surface-2 rounded-full h-2 mt-3 overflow-hidden">
                    <div className="bg-warning h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, weeklyTargetCompletionRate)}%` }} />
                  </div>
                  <div className="mt-2 text-[11px] text-muted space-y-0.5">
                    {activeWeeklyTarget ? (
                      <>
                        <div>
                          {targetPeriodText(activeWeeklyTarget)} · Veren: <strong className="text-fg-2">{ownerText(activeWeeklyTarget)}</strong>
                        </div>
                        <div>
                          {weeklyTargetSolved >= weeklyTargetTotal ? (
                            <span className="text-success-fg font-bold">✓ Tamamlandı</span>
                          ) : (
                            <span className="text-warning-fg font-semibold">{weeklyTargetTotal - weeklyTargetSolved} soru kaldı</span>
                          )}
                        </div>
                        {activeTargets.length > 1 && (
                          <div id="other-targets-note">
                            +{activeTargets.length - 1} hedef daha:{' '}
                            {activeTargets
                              .slice(1)
                              .map((t) => `${ownerText(t)} (${t.subject || 'Tüm dersler'}, ${t.targetQuestions})`)
                              .join(', ')}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span>Bu hafta hedef yok (varsayılan: günde 50 soru)</span>
                        <button type="button" onClick={() => handleOpenStudentTargetModal(activeStudent)} className="text-[10px] font-bold text-warning-fg underline cursor-pointer">
                          Hedef ver
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Çalışma Disiplini & Soru Çözülmeyen Günler */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Çalışma Disiplini</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-[#1e3a8a] dark:text-blue-200">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-fg tracking-tight">
                      {weeklyAnalytics.solvedDaysCount}
                      <span className="text-base text-subtle font-semibold"> / 7 Gün</span>
                    </span>
                  </div>

                  {/* Soru Çözülmeyen Günler Rozeti */}
                  <div className="mt-3">
                    {weeklyAnalytics.unsolvedDaysCount > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-orange-600 dark:text-orange-300" />
                          {weeklyAnalytics.unsolvedDaysCount} Gün Çözülmedi
                        </span>
                        <span className="text-[10px] text-muted font-medium">
                          ({weeklyAnalytics.unsolvedDays.join(', ')})
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-300" />
                        7 Gün Kesintisiz Çalışma
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-muted">
                    Haftalık Devamlılık Oranı: <strong className="text-fg-2">%{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Öğrenci Başarı Durumu & Doğruluk Oranı */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Başarı & Doğruluk Oranı</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#1e3a8a] dark:text-blue-200 tracking-tight">
                      %{weeklyAnalytics.accuracyPercentage}
                    </span>
                    <span className="text-xs font-semibold text-muted">Net Başarı</span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-fg text-surface">
                      {weeklyAnalytics.statusAssessment.badgeText}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-muted flex gap-2">
                    <span className="text-emerald-600 dark:text-emerald-300 font-semibold">D: {weeklyAnalytics.totalCorrect}</span>
                    <span className="text-rose-600 dark:text-rose-300 font-semibold">Y: {weeklyAnalytics.totalWrong}</span>
                    <span className="text-muted">B: {weeklyAnalytics.totalEmpty}</span>
                  </div>
                </div>
              </div>

              {/* Bu haftaya denk gelen hedefler: her hedefin gün gün tablosu ve grafiği (Aşama 10b) */}
              {activeStudent && activeTargets.length > 0 && (
                <StudentTargetCards targets={activeTargets} studentId={activeStudent.id} logs={allLogs} />
              )}

              {/* ========================================================================= */}
              {/* GOOGLE LOOKER STUDIO ANA GRAFİĞİ (HAFİF GRİ ARKA PLAN, KOYU GRİ METİNLER) */}
              {/* ========================================================================= */}
              <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
                {/* Chart Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-fg tracking-tight">
                        Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-fg text-surface">
                        {weeklyAnalytics.studentName}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Dönem: {weeklyAnalytics.weekLabel} • Sütun tepelerinde net soru sayıları ve turuncu günlük hedef çizgisi
                    </p>
                  </div>

                  {/* Chart Type & Legend Switcher */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Legend */}
                    <WeeklyChartLegend dailyTarget={dailyQuestionTarget} mode={chartVisualType} />

                    {/* Chart Mode Buttons */}
                    <div className="flex rounded-lg bg-surface-2 p-0.5 border border-line text-xs">
                      <button
                        type="button"
                        onClick={() => setChartVisualType('bar')}
                        className={`px-3 py-1 rounded-md font-bold transition-all ${
                          chartVisualType === 'bar'
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-muted hover:text-fg'
                        }`}
                      >
                        Sütun Grafiği
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartVisualType('area')}
                        className={`px-3 py-1 rounded-md font-bold transition-all ${
                          chartVisualType === 'area'
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-muted hover:text-fg'
                        }`}
                      >
                        Trend & Alan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Plot Area with Light Gray Background */}
                <div className="h-80 w-full bg-surface-2 rounded-xl p-3 border border-line">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartVisualType === 'bar' ? (
                      <BarChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 28, right: isNarrow ? 6 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                        <XAxis
                          dataKey={isNarrow ? 'dayShortName' : 'dayName'}
                          interval={0}
                          stroke="var(--color-muted)"
                          fontSize={isNarrow ? 10 : 12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-line-strong)' }}
                        />
                        <YAxis
                          stroke="var(--color-muted)"
                          fontSize={isNarrow ? 10 : 12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-line-strong)' }}
                          domain={[0, (max: number) => Math.max(max, dailyQuestionTarget) + Math.ceil(dailyQuestionTarget * 0.25)]}
                          allowDecimals={false}
                        />
                        <Tooltip content={renderLookerTooltip} cursor={CHART_BAR_CURSOR} />

                        {/* Canlı Turuncu Hedef Referans Çizgisi */}
                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke={CHART_COLORS.target}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={<TargetLineLabel text={`Hedef: ${dailyQuestionTarget} Soru`} />}
                        />

                        {/* Sütun Çizimi ve Tepede Net Değerler (LabelList) */}
                        <Bar
                          dataKey="totalQuestions"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={55}
                          minPointSize={4}
                        >
                          {/* Sütunların üzerine net sayıları yazdır */}
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="var(--color-fg)"
                            fontSize={isNarrow ? 10 : 12}
                            fontWeight={800}
                            offset={6}
                            formatter={(val: unknown) => String(Number(val) || 0)}
                          />
                          {weeklyAnalytics.days.map((entry, index) => {
                            // Gece mavisi (#1e3a8a), hedefe ulaştıysa lacivert, 0 ise belirgin turuncu/rose
                            const isZero = entry.totalQuestions === 0;
                            const isAboveTarget = entry.totalQuestions >= dailyQuestionTarget;
                            return (
                              <Cell
                                key={`cell-looker-${index}`}
                                fill={isZero ? CHART_COLORS.zero : isAboveTarget ? CHART_COLORS.met : CHART_COLORS.below}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 28, right: isNarrow ? 6 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="lookerNavyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                        <XAxis
                          dataKey={isNarrow ? 'dayShortName' : 'dayName'}
                          interval={0}
                          stroke="var(--color-muted)"
                          fontSize={isNarrow ? 10 : 12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-line-strong)' }}
                        />
                        <YAxis
                          stroke="var(--color-muted)"
                          fontSize={isNarrow ? 10 : 12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-line-strong)' }}
                          domain={[0, (max: number) => Math.max(max, dailyQuestionTarget) + Math.ceil(dailyQuestionTarget * 0.25)]}
                          allowDecimals={false}
                        />
                        <Tooltip content={renderLookerTooltip} cursor={CHART_LINE_CURSOR} />

                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke={CHART_COLORS.target}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={<TargetLineLabel text={`Hedef: ${dailyQuestionTarget} Soru`} />}
                        />

                        <Area
                          type="monotone"
                          dataKey="totalQuestions"
                          stroke="var(--chart-1)"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#lookerNavyGradient)"
                          dot={{ r: 5, fill: '#ea580c', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                          activeDot={{ r: 7, fill: '#ea580c' }}
                        >
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="var(--color-fg)"
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
                <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
                    <div>
                      <h4 className="text-sm font-bold text-fg">
                        Günlük Soru Çözüm ve Başarı Tablosu
                      </h4>
                      <p className="text-[11px] text-muted">
                        Öğrenci: <strong className="text-fg">{weeklyAnalytics.studentName}</strong> • {weeklyAnalytics.className}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-surface-2 text-fg-2 border border-line">
                      7 Günlük Detay
                    </span>
                  </div>

                  <p className="xl:hidden mb-2 text-[11px] text-muted" data-testid="table-scroll-hint">
                    Tablo sığmazsa yana kaydırabilirsiniz →
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                        <tr>
                          <th className="px-2.5 py-2.5">Gün</th>
                          <th className="px-2.5 py-2.5">Tarih</th>
                          <th className="px-2.5 py-2.5 text-center">Çözülen Soru</th>
                          <th className="px-2.5 py-2.5">Ders Dağılımı</th>
                          <th className="px-2.5 py-2.5 text-center">Hedef Durumu</th>
                          <th className="px-2.5 py-2.5 text-center">Durum</th>
                          <th className="px-2.5 py-2.5 text-center">Öğretmen Tebriki</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {weeklyAnalytics.days.map((d) => {
                          const metTarget = d.totalQuestions >= dailyQuestionTarget;
                          const completionRate = Math.min(100, Math.round((d.totalQuestions / dailyQuestionTarget) * 100));
                          const praised = isPraisedForDate(d.dateStr);

                          return (
                            <tr key={d.dateStr} className="hover:bg-surface-2 transition-colors">
                              <td className="px-2.5 py-2.5 font-bold text-fg">{d.dayName}</td>
                              <td className="px-2.5 py-2.5 text-muted whitespace-nowrap">{shortTurkishDate(d.dateStr)}</td>
                              <td className="px-2.5 py-2.5 text-center">
                                <span className="font-extrabold text-fg text-sm">
                                  {d.totalQuestions}
                                </span>
                              </td>
                              <td className="px-2.5 py-2.5 text-muted min-w-[130px] max-w-[220px] whitespace-normal break-words">
                                {d.subjectsText || <span className="text-subtle italic">Ders kaydı yok</span>}
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <div className="w-12 bg-surface-3 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full ${metTarget ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                      style={{ width: `${completionRate}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-muted">%{completionRate}</span>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                {d.hasSolved ? (
                                  metTarget ? (
                                    <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                      Hedef Tamamlandı
                                    </span>
                                  ) : (
                                    <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                                      Kısmi Çözüm
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                                    0 Soru ⚠️
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                {d.totalQuestions > 0 ? (
                                  praised ? (
                                    <span className="inline-flex whitespace-nowrap items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 shadow-2xs">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                                      <span>Tebrik Edildi ✓</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPraiseModal(d)}
                                      className="inline-flex whitespace-nowrap items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-white shadow-xs hover:shadow transition-all cursor-pointer hover:scale-105"
                                      title={`${activeStudent?.name} öğrencisine ${d.dayName} günü çözdüğü ${d.totalQuestions} soru için tebrik ve aferin mesajı gönder`}
                                    >
                                      <Award className="w-3.5 h-3.5 text-amber-100" />
                                      <span>Tebrik Et ⭐</span>
                                    </button>
                                  )
                                ) : (
                                  <span className="text-subtle text-xs italic">-</span>
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
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
                      <BookOpen className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                      <h4 className="text-sm font-bold text-fg">
                        Derslere Göre Soru Dağılımı
                      </h4>
                    </div>

                    {/* Ders Bazlı İlerleme Çubukları */}
                    {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {weeklyAnalytics.subjectBreakdown.map((sub, i) => {
                          return (
                            <div key={sub.subject} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-fg">{sub.subject}</span>
                                <span className="font-bold text-orange-600 dark:text-orange-300">
                                  {sub.count} Soru (%{sub.percentage})
                                </span>
                              </div>
                              <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${
                                    i === 0 ? 'bg-fg' : i === 1 ? 'bg-orange-500' : 'bg-[var(--chart-1)]'
                                  }`}
                                  style={{ width: `${sub.percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                    )}

                    {/* Pedagojik Değerlendirme Raporu */}
                    <div className="mt-5 p-3.5 bg-surface-2 rounded-xl border border-line text-xs text-fg-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                        <Award className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                        <span>Rehberlik & Başarı Analizi</span>
                      </div>
                      <p className="leading-relaxed text-muted">
                        {weeklyAnalytics.statusAssessment.reportSummary}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-line">
                    <button
                      onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                      className="w-full py-2.5 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-orange-400" />
                      <span>Haftalık Raporu PDF İndir</span>
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
              <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Açılır Pencere ile Ay Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-month-picker-modal"
                    type="button"
                    onClick={() => setIsMonthModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-surface-2 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 border border-line-strong hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    title="Geçmiş ayları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100/80 dark:bg-orange-500/15 group-hover:bg-orange-600 text-orange-600 dark:text-orange-300 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold text-orange-600 dark:text-orange-300 uppercase tracking-wider">
                          Aylık İnceleme Dönemi
                        </span>
                        {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                          <span className="text-[9px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-1.5 py-0.2 rounded-md">
                            Aktif Ay
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                            Geçmiş Dönem
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                        <span className="hidden xs:inline text-muted font-medium">Analiz Ayı:</span>
                        <span className="text-[#1e3a8a] dark:text-blue-200 underline decoration-orange-400/60 decoration-2 underline-offset-2">
                          {monthlyAnalytics.monthLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-line text-subtle group-hover:text-orange-600 dark:group-hover:text-orange-300 flex items-center gap-1 text-xs font-semibold shrink-0">
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 dark:text-orange-300 md:text-subtle" />
                    </div>
                  </button>

                  {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                    <button
                      id="btn-reset-current-month"
                      type="button"
                      onClick={() => setMonthDate({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                      className="px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
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
                      className="px-3 py-2 bg-surface-2 hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:border-orange-300 dark:hover:border-orange-500/30 text-fg-2 hover:text-orange-900 dark:hover:text-orange-200 border border-line rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Sınıfın bütün öğrencilerini ve başarı sıralamasını gör"
                    >
                      <Users className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                      <span>{activeClass.name} Sınıfının Tümünü Göster ({classStudents.length})</span>
                    </button>
                  )}
                  <div className="flex items-center gap-3 bg-surface-2 px-4 py-2 rounded-xl border border-line">
                    <div className="w-8 h-8 rounded-full bg-fg text-orange-700 dark:text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
                      {activeStudent.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-fg block">{activeStudent.name}</span>
                      {activeStudent.className && (
                        <span className="text-[10px] text-subtle block">{activeStudent.className}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Aylık Executive KPI Scorecards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ayda Çözülen Toplam Soru */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Aylık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-[#1e3a8a] dark:text-blue-200">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-fg tracking-tight">
                      {monthlyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-muted">Soru</span>
                  </div>
                  <div className="mt-3 text-[11px] text-muted">
                    Haftalık Ortalama: <strong className="text-fg">{monthlyAnalytics.weeklyAverage} soru</strong>
                  </div>
                </div>

                {/* 2. Aylık Hedef Tamamlama Oranı */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Aylık Müfredat Hedefi</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300">
                      <Target className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-orange-600 dark:text-orange-300 tracking-tight">
                      %{monthlyTargetCompletionRate}
                    </span>
                    <span className="text-xs font-semibold text-muted">Tamamlandı</span>
                  </div>
                  <div className="w-full bg-surface-2 rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="bg-orange-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, monthlyTargetCompletionRate)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-muted">
                    Aylık Hedef: <strong>{monthlyTargetTotal} Soru</strong>
                    <span className="block text-[10px] text-subtle">
                      {monthlyPlan.hasGeneralTarget ? 'Genel hedeflerin günlük sayısı × ayın günleri' : `Genel hedef yok: günde 50 × ${monthlyPlan.days} gün`}
                    </span>
                  </div>
                </div>

                {/* 3. Aktif Soru Çözülen Günler */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Aktif Çalışma Günleri</span>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-[#1e3a8a] dark:text-blue-200">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-fg tracking-tight">
                      {monthlyAnalytics.activeDaysCount}
                      <span className="text-base text-subtle font-semibold"> Gün</span>
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-muted">
                    Aylık Düzenlilik: <strong className="text-fg">%{Math.round((monthlyAnalytics.activeDaysCount / monthlyPlan.days) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Geçmiş Aya Göre İlerleme Durumu */}
                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted text-xs font-semibold">
                    <span>Geçmiş Aya Göre Gelişim</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    {monthlyAnalytics.monthlyDifference >= 0 ? (
                      <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                        +{monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    ) : (
                      <span className="text-2xl font-black text-rose-700 dark:text-rose-300">
                        {monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-[11px] text-muted">
                    Önceki Ay: <strong className="text-fg">{monthlyAnalytics.previousMonthTotal} soru</strong> {monthlyAnalytics.previousMonthTotal > 0 ? `(${monthlyAnalytics.monthlyGrowthRate >= 0 ? '+' : ''}%${monthlyAnalytics.monthlyGrowthRate})` : ''}
                  </div>
                </div>
              </div>

              {/* Aylık Hafta Bazında Soru Çözüm Grafiği */}
              <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
                  <div>
                    <h4 className="text-base font-bold text-fg tracking-tight">
                      Aylık Hafta Bazında Soru Çözüm ve Başarı Grafiği
                    </h4>
                    <p className="text-xs text-muted mt-0.5">
                      {monthlyAnalytics.monthLabel} ayı süresince haftalık toplam çözülen soru sayıları
                    </p>
                  </div>
                </div>

                <div className="h-80 w-full bg-surface-2 rounded-xl p-3 border border-line">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyAnalytics.weeks}
                      margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                      <XAxis
                        dataKey="weekLabel"
                        interval={0}
                        tickFormatter={(v: string) => (isNarrow ? String(v).replace(/\s*\(.*\)$/, '').replace('Hafta', 'Hf.') : String(v))}
                        stroke="var(--color-muted)"
                        fontSize={isNarrow ? 10 : 11}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-line-strong)' }}
                      />
                      <YAxis
                        stroke="var(--color-muted)"
                        fontSize={12}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-line-strong)' }}
                      />
                      <Tooltip content={<MonthlyBucketTooltip plan={monthlyPlan} />} cursor={CHART_BAR_CURSOR} />
                      <Bar
                        dataKey="totalQuestions"
                        fill="var(--chart-1)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={60}
                      >
                        <LabelList
                          dataKey="totalQuestions"
                          position="top"
                          fill="var(--color-fg)"
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
                <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line">
                    Haftalık Soru Çözüm Dökümü Tablosu
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                        <tr>
                          <th className="px-3.5 py-2.5">Hafta / Tarih Aralığı</th>
                          <th className="px-3.5 py-2.5 text-center">Haftalık Soru Sayısı</th>
                          <th className="px-3.5 py-2.5 text-center">Aktif Gün</th>
                          <th className="px-3.5 py-2.5">Ağırlıklı Ders</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {monthlyAnalytics.weeks.map((w) => (
                          <tr key={w.weekIndex} className="hover:bg-surface-2 transition-colors">
                            <td className="px-3.5 py-2.5 font-bold text-fg">{w.weekLabel}</td>
                            <td className="px-3.5 py-2.5 text-center font-extrabold text-[#1e3a8a] dark:text-blue-200 text-sm">
                              {w.totalQuestions} Soru
                            </td>
                            <td className="px-3.5 py-2.5 text-center text-fg-2 font-semibold">{w.activeDaysCount} Gün</td>
                            <td className="px-3.5 py-2.5 font-medium text-orange-600 dark:text-orange-300">{w.topSubject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                      Aylık Ders Dağılım Payları
                    </h4>
                    {monthlyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {monthlyAnalytics.subjectBreakdown.map((sub, i) => (
                          <div key={sub.subject} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-fg">{sub.subject}</span>
                              <span className="font-bold text-orange-600 dark:text-orange-300">
                                {sub.count} Soru (%{sub.percentage})
                              </span>
                            </div>
                            <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${
                                  i === 0 ? 'bg-fg' : i === 1 ? 'bg-orange-500' : 'bg-[var(--chart-1)]'
                                }`}
                                style={{ width: `${sub.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted italic">Ders dökümü bulunamadı.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-line">
                    <button
                      onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                      className="w-full py-2.5 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-orange-400" />
                      <span>Aylık Raporu PDF İndir</span>
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
            <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-bold text-fg">
                    {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm & Başarı Sıralaması
                  </h3>
                  <p className="text-xs text-muted">
                    Haftalık ve aylık toplam çözülen soru sayıları, soru çözülmeyen gün alarmları ve başarı dereceleri
                  </p>
                </div>
                <div className="text-xs font-bold text-fg bg-surface-2 px-3 py-1.5 rounded-lg border border-line">
                  Toplam {classOverviewData.length} Öğrenci
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
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
                  <tbody className="divide-y divide-line">
                    {classOverviewData.map((row, idx) => (
                      <tr
                        key={row.student.id}
                        className={`hover:bg-surface-2 transition-colors ${
                          row.student.id === selectedStudentId ? 'bg-orange-50/50 dark:bg-orange-500/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-muted">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-fg">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="hover:text-orange-600 dark:hover:text-orange-300 text-left transition-colors cursor-pointer"
                          >
                            {row.student.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-fg text-sm">
                          {row.weeklyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.unsolvedDaysCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-500/30">
                              {row.unsolvedDaysCount} Gün Çözülmedi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                              Her Gün Çözüldü
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">
                          <span className={row.weeklyDiff >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
                            {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} {row.prevWeekTotal > 0 ? `(${row.weeklyGrowthRate >= 0 ? '+' : ''}%${row.weeklyGrowthRate})` : '(önceki hafta kayıt yok)'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-[#1e3a8a] dark:text-blue-200">
                          {row.monthlyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-surface-2 text-fg border border-line">
                            {row.badgeText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="px-3 py-1 bg-fg hover:bg-fg text-surface rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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
      {/* SORU KAYITLARI & GEÇMİŞ YÖNETİM MODALI                                    */}
      {/* ========================================================================= */}
      {isManageLogsModalOpen && activeStudent && (
        <div
          id="modal-manage-logs-backdrop"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsManageLogsModalOpen(false);
            }
          }}
        >
          <div
            id="modal-manage-logs-content"
            className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-line flex items-start justify-between gap-4 bg-gradient-to-r from-surface-2 to-surface">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0 shadow-xs">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg flex items-center gap-2">
                    <span>{activeStudent.name} — Soru Kayıtları & Geçmiş</span>
                    <span className="text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 px-2 py-0.5 rounded-full">
                      Yönetim & Senkronizasyon
                    </span>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Öğrenciye ait kayıtlı soru çözümlerini görüntüleyin, hatalı veya mükerrer kayıtları güvenle silin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageLogsModalOpen(false)}
                className="p-2 text-subtle hover:text-fg-2 hover:bg-surface-2 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content List */}
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-3">
              {allLogs.filter((l) => l.studentId === activeStudent.id).length === 0 ? (
                <div className="text-center py-10 text-subtle">
                  <HelpCircle className="w-10 h-10 mx-auto text-subtle mb-2 opacity-70" />
                  <p className="font-bold text-sm text-muted">Henüz Kayıtlı Soru Girişi Yok</p>
                  <p className="text-xs text-subtle mt-1">Öğrenciye ait soru çözümü silinmiş veya henüz kayıt eklenmemiş.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-muted font-bold border-b border-line">
                      <tr>
                        <th className="px-4 py-2.5">Tarih</th>
                        <th className="px-4 py-2.5 text-center">Toplam Soru</th>
                        <th className="px-4 py-2.5">Ders Dağılımı</th>
                        <th className="px-4 py-2.5">Not</th>
                        <th className="px-4 py-2.5 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {allLogs
                        .filter((l) => l.studentId === activeStudent.id)
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                        .map((log) => (
                          <tr key={log.id} className="hover:bg-surface-2 transition-colors">
                            <td className="px-4 py-3 font-bold text-fg">
                              {formatTurkishDate(log.date)}
                            </td>
                            <td className="px-4 py-3 text-center font-extrabold text-[#1e3a8a] dark:text-blue-200 text-sm">
                              {log.totalQuestions} Soru
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {Array.isArray(log.entries) && log.entries.length > 0
                                ? log.entries.map((e) => `${e.subject}: ${e.questionCount}`).join(', ')
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-muted italic max-w-xs truncate">
                              {log.notes || '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm('Bu soru kaydını silmek istediğinize emin misiniz? Ana sayfa özetleri ve grafikler anında güncellenecektir.')) {
                                    try {
                                      await dataService.deleteQuestionLog(log.id);
                                    } catch {
                                      // hata uyarısı gösterildi, kayıt geri getirildi
                                    }
                                  }
                                }}
                                className="p-1.5 text-rose-600 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Kaydı Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-line bg-surface-2 flex items-center justify-between">
              <span className="text-xs text-muted">
                Toplam <strong>{allLogs.filter((l) => l.studentId === activeStudent.id).length}</strong> kayıt
              </span>
              <button
                type="button"
                onClick={() => setIsManageLogsModalOpen(false)}
                className="px-4 py-2 bg-fg text-surface rounded-xl text-xs font-bold hover:bg-fg transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
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
            className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-line flex items-start justify-between gap-4 bg-gradient-to-r from-surface-2 to-surface">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0 shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg flex items-center gap-2">
                    <span>Geçmiş Hafta Seçimi</span>
                    <span className="text-[11px] font-semibold bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30 px-2 py-0.5 rounded-full">
                      Açılır Pencere
                    </span>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    <strong className="text-fg-2">{activeStudent.name}</strong> öğrencisinin geçmiş haftalarda çözdüğü soruları incelemek için dilediğiniz haftayı seçin.
                  </p>
                </div>
              </div>
              <button
                id="btn-close-week-modal"
                onClick={() => setIsWeekModalOpen(false)}
                className="p-2 text-subtle hover:text-fg-2 hover:bg-surface-2 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Filter & Search Bar */}
            <div className="p-4 border-b border-line bg-surface-2 space-y-3">
              {/* Hızlı Atlama Düğmeleri */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-muted mr-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-subtle" />
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
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
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
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
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
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
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
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
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
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
                  }`}
                >
                  1 Ay Önce (4. Hafta)
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={weekSearchQuery}
                    onChange={(e) => setWeekSearchQuery(e.target.value)}
                    placeholder="Hafta veya ay ara (Örn: Eylül, Ağustos)..."
                    className="w-full pl-9 pr-8 py-1.5 bg-surface border border-line-strong rounded-xl text-xs text-fg focus:outline-none focus:border-orange-500"
                  />
                  {weekSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setWeekSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-xl border border-line-strong shrink-0">
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      weekFilterTab === 'all'
                        ? 'bg-fg text-surface'
                        : 'text-muted hover:text-fg'
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
                        : 'text-muted hover:text-fg'
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
                <div className="p-8 text-center text-muted text-xs">
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
                          ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-500/10 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-line hover:border-orange-300 dark:hover:border-orange-500/30 hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-fg text-orange-700 dark:text-orange-400'
                              : 'bg-surface-2 text-subtle'
                          }`}
                        >
                          {item.offset === 0 ? '0' : item.offset}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-orange-950 dark:text-orange-200' : 'text-fg'
                              }`}
                            >
                              {item.weekLabel}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                item.offset === 0
                                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                  : isSelected
                                  ? 'bg-orange-200 dark:bg-orange-500/20 text-orange-900 dark:text-orange-200'
                                  : 'bg-surface-2 text-muted'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted mt-0.5">
                            {formatTurkishDate(item.startDateStr)} - {formatTurkishDate(item.endDateStr)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-fg flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-300 font-semibold block">
                                {item.activeDaysCount} gün soru girişi yapıldı
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-subtle font-medium">
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
                              className="px-3 py-1.5 bg-surface hover:bg-fg text-fg-2 hover:text-surface border border-line-strong hover:border-line text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
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
            <div className="p-4 bg-surface-2 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted">
                <Sparkles className="w-4 h-4 text-orange-700 dark:text-orange-400 shrink-0" />
                <span>Hafta seçildiğinde grafikler, başarı analizi ve PDF raporları anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekOffset(0);
                      setIsWeekModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-line-strong text-fg-2 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-orange-600 dark:text-orange-300" />
                    <span>Güncel Haftaya Git</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWeekModalOpen(false)}
                  className="px-4 py-1.5 bg-fg hover:bg-fg text-surface font-bold rounded-xl transition-colors cursor-pointer"
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
            className="w-full max-w-2xl bg-surface border border-line-strong rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Başlık */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-surface via-surface-2 to-surface text-surface flex items-center justify-between border-b border-line shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                      Açılır Pencere
                    </span>
                    <span className="text-xs text-surface font-medium">
                      Öğrenci: <strong className="text-surface">{activeStudent.name}</strong>
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-surface tracking-tight">
                    Geçmiş Ayları ve Çözülen Soruları İncele
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-fg hover:bg-fg text-surface hover:text-surface flex items-center justify-center transition-colors cursor-pointer"
                title="Kapat (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hızlı Filtre & Arama Bölümü */}
            <div className="p-4 bg-surface-2 border-b border-line space-y-3 shrink-0">
              {/* Hızlı Butonlar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-subtle text-[11px] font-bold shrink-0">Hızlı Dönem:</span>
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
                      : 'bg-surface hover:bg-surface-2 text-fg-2 border border-line'
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
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-surface hover:bg-surface-2 text-fg-2 border border-line"
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
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-surface hover:bg-surface-2 text-fg-2 border border-line"
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
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-surface hover:bg-surface-2 text-fg-2 border border-line"
                >
                  3 Ay Önce
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={monthSearchQuery}
                    onChange={(e) => setMonthSearchQuery(e.target.value)}
                    placeholder="Ay veya yıl ara (Örn: Eylül, 2026)..."
                    className="w-full pl-9 pr-8 py-1.5 bg-surface border border-line-strong rounded-xl text-xs text-fg focus:outline-none focus:border-orange-500"
                  />
                  {monthSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMonthSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-xl border border-line-strong shrink-0">
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      monthFilterTab === 'all'
                        ? 'bg-fg text-surface'
                        : 'text-muted hover:text-fg'
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
                        : 'text-muted hover:text-fg'
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
                <div className="p-8 text-center text-muted text-xs">
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
                          ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-500/10 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-line hover:border-orange-300 dark:hover:border-orange-500/30 hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-fg text-orange-700 dark:text-orange-400'
                              : 'bg-surface-2 text-subtle'
                          }`}
                        >
                          {item.month + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-orange-950 dark:text-orange-200' : 'text-fg'
                              }`}
                            >
                              {item.monthLabel}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                item.year === new Date().getFullYear() && item.month === new Date().getMonth()
                                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                  : isSelected
                                  ? 'bg-orange-200 dark:bg-orange-500/20 text-orange-900 dark:text-orange-200'
                                  : 'bg-surface-2 text-muted'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted mt-0.5">
                            {item.year} Yılı • {TURKISH_MONTHS[item.month]} Dönemi
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-fg flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-300 font-semibold block">
                                {item.activeDaysCount} aktif çalışma günü
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-subtle font-medium">
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
                              className="px-3 py-1.5 bg-surface hover:bg-fg text-fg-2 hover:text-surface border border-line-strong hover:border-line text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
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
            <div className="p-4 bg-surface-2 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted">
                <Sparkles className="w-4 h-4 text-orange-700 dark:text-orange-400 shrink-0" />
                <span>Ay seçildiğinde aylık grafikler, başarı oranları ve aylık PDF anında güncellenir.</span>
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
                    className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-line-strong text-fg-2 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-orange-600 dark:text-orange-300" />
                    <span>Güncel Aya Git</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMonthModalOpen(false)}
                  className="px-4 py-1.5 bg-fg hover:bg-fg text-surface font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Soru Hedefi Ver / Düzenle (Aşama 10) */}
      <WeeklyTargetModal
        open={targetForm.open}
        onClose={() => {
          setTargetForm({ open: false });
          setTargetUpdateTrigger((prev) => prev + 1);
        }}
        students={students}
        classes={classes}
        editTarget={targetForm.editTarget}
        presetKind={targetForm.presetKind}
        presetStudentId={targetForm.presetStudentId}
        presetClassId={targetForm.presetClassId}
        defaultStart={currentWeekStartDate}
        defaultEnd={currentWeekEndDate}
        onSaved={handleTargetSaved}
      />

      {/* Öğrenci Hedefleri Listesi */}
      {isStudentTargetsModalOpen && (
        <StudentTargetsModal
          isOpen={isStudentTargetsModalOpen}
          onClose={() => {
            setIsStudentTargetsModalOpen(false);
            setTargetUpdateTrigger((prev) => prev + 1);
          }}
          students={students}
          classes={classes}
          allLogs={allLogs}
          onEdit={openEditTarget}
          onNew={() => openNewTarget('student', activeStudent?.id, activeStudent?.classId)}
          onSelectStudentToAnalyze={(stId) => {
            handleSelectStudent(stId);
          }}
        />
      )}

      {/* Sınıf Hedefleri Listesi */}
      {isClassTargetsModalOpen && (
        <ClassTargetsModal
          isOpen={isClassTargetsModalOpen}
          onClose={() => {
            setIsClassTargetsModalOpen(false);
            setTargetUpdateTrigger((prev) => prev + 1);
          }}
          classes={classes}
          students={students}
          allLogs={allLogs}
          onEdit={openEditTarget}
          onNew={() => openNewTarget('class', undefined, activeClass && activeClass.id !== 'all' ? activeClass.id : undefined)}
          onSelectClassToAnalyze={(clsId) => {
            handleSelectClass(clsId);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* ÖĞRETMEN TEBRİK VE AFERİN BİLDİRİMİ GÖNDERME MODALI                     */}
      {/* ========================================================================= */}
      {praiseTargetDay && activeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-amber-200 dark:border-amber-500/30 relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-fg">
                    Öğrenciye Tebrik ve Aferin Gönder
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {activeStudent.name} • {formatTurkishDate(praiseTargetDay.dateStr)} ({praiseTargetDay.dayName})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPraiseTargetDay(null)}
                className="p-1 rounded-lg text-subtle hover:text-muted hover:bg-surface-2 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Performans Özeti Rozeti */}
            <div className="bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/30 rounded-xl p-3.5 mb-4 text-xs text-amber-950 dark:text-amber-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider block">
                  Günlük Çözülen Soru
                </span>
                <span className="text-lg font-black text-amber-900 dark:text-amber-200">
                  {praiseTargetDay.totalQuestions} Soru
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider block">
                  Ders Dağılımı
                </span>
                <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate max-w-[200px] block">
                  {praiseTargetDay.subjectsText || 'Genel Çözüm'}
                </span>
              </div>
            </div>

            {/* Hızlı Tebrik Şablonları */}
            <div className="space-y-1.5 mb-3">
              <label className="text-[11px] font-bold text-fg-2 block">
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
                        ? 'bg-amber-100/80 dark:bg-amber-500/15 border-amber-400 font-bold text-amber-950 dark:text-amber-200 ring-1 ring-amber-400'
                        : 'bg-surface-2 hover:bg-amber-50/50 dark:hover:bg-amber-500/10 border-line text-fg-2'
                    }`}
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>

            {/* Özelleştirilebilir Mesaj Kutusu */}
            <div className="mb-4">
              <label className="text-[11px] font-bold text-fg-2 block mb-1">
                İletilecek Bildirim Mesajı:
              </label>
              <textarea
                rows={3}
                value={praiseCustomMessage}
                onChange={(e) => setPraiseCustomMessage(e.target.value)}
                className="w-full p-2.5 bg-surface border border-line-strong rounded-xl text-xs text-fg font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="Öğrenciye iletilecek tebrik mesajını yazınız..."
              />
              <span className="text-[10px] text-muted block mt-1">
                ℹ️ Bu bildirim öğrencinin ana ekranında (portalında) tebrik kartı olarak anında gösterilecektir.
              </span>
            </div>

            {/* Modal Butonları */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setPraiseTargetDay(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:bg-surface-2 transition-colors cursor-pointer"
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
        <div className="fixed bottom-6 right-6 z-50 bg-surface text-fg px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/40 flex items-center space-x-2.5 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{praiseSuccessToast}</span>
        </div>
      )}
    </div>
  );
};
