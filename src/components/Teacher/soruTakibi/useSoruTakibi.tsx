// Soru Takibi: sayfanın bütün durumu ve işlemleri (Aşama 354b). Görünüm parçaları bunu useSoruTakibiBaglam() ile okur.
import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Student, ClassGroup, StudentQuestionLog, WeeklyQuestionTarget, StudentNotification } from '../../../types';
import { dataService } from '../../../services/dataService';
import { useQuickFocus } from '../../../lib/quickFocus';
import { TargetFormSaved } from '../WeeklyTargetModal';
import { callMail, describeMailResult } from '../../../lib/mailApi';
import { periodOf } from '../TargetListParts';
import { usePlanWallData } from '../../Student/StudentTargetCards';
import { isFlexibleTarget as isFlexTarget, isPlanCountTarget, isPlanMirrorTarget } from '../../../utils/targetDays';
import { generalDailyTarget, computeMonthlyTargetPlan, useTodayIso, useIsNarrowScreen, parseIsoDate } from '../../Student/soruModulu/ortak';
import { computeWeeklyAnalytics, computeMonthlyAnalytics, formatTurkishDate, formatDateISO, getWeekStartOf, TURKISH_MONTHS } from '../../../utils/questionAnalytics';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { useHistoryState } from '../../../lib/useHistoryState';
import { usePagedList } from '../../../lib/listPaging';
import { basariBildir, useBildirimKanali } from '../../../lib/bildirim';
import { NO_LOGS, QuestionTrackingViewProps } from './ortak';

export function useSoruTakibi({
  classes,
  students,
}: QuestionTrackingViewProps) {
  // Sınıf seçimi (varsayılan: boş, "Sınıf Seçiniz")
  // Aşama 52: sınıf ve öğrenci seçimi tarayıcı geçmişine yazılır; "Geri" önceki seçime (ör. öğrenciden sınıfa) döner
  const [selectedClassId, setSelectedClassId] = useHistoryState<string>('qt.class', '');

  // Seçili öğrenci (varsayılan: boş, "Öğrenci Seçiniz")
  const [selectedStudentId, setSelectedStudentId] = useHistoryState<string>('qt.student', '');

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

  // Aşama 28: ana sayfadaki "… 45 soru girdi" bildiriminden gelindiyse o öğrencinin sayfasını aç
  useQuickFocus(['student'], (f) => {
    const st = students.find((x) => x.id === f.id);
    if (!st) return;
    setSelectedClassId(st.classId || '');
    setSelectedStudentId(st.id);
    setDropdownScope('class');
  });

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
    // Aşama 349b: öğrenci bildirimleri konusuz (genel) değişiklikle gelir; liste yine de kapsayıcı yazılır
    const unsub = dataService.subscribe(() => {
      setStudentNotifications(dataService.getStudentNotifications());
    }, ['hedef', 'soru']);
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
  const setMailNotice = useBildirimKanali(); // Aşama 353: ortak bildirim

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

  // Aşama 191: açılır pencerelerde Esc ortak katmandan (OverlayLayer)

  // Soru logları
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  const [isManageLogsModalOpen, setIsManageLogsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    }, ['hedef', 'soru']); // Aşama 349b
    return unsub;
  }, []);

  // Yerel "bugün": pencere odaklanınca / görünür olunca ve her dakika yenilenir (gece yarısı sonrası eskimez)
  const todayIsoStr = useTodayIso();
  const isNarrow = useIsNarrowScreen();

  // HIZ (Aşama 15): kayıtlar öğrenciye göre bir kez gruplanır; her öğrenci için tüm kayıtlar tekrar taranmaz
  const logsByStudent = useMemo(() => {
    const m = new Map<string, StudentQuestionLog[]>();
    for (const l of allLogs) {
      let a = m.get(l.studentId);
      if (!a) m.set(l.studentId, (a = []));
      a.push(l);
    }
    return m;
  }, [allLogs]);
  const todayCountByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of allLogs) if (l.date === todayIsoStr) m.set(l.studentId, (m.get(l.studentId) || 0) + (l.totalQuestions || 0));
    return m;
  }, [allLogs, todayIsoStr]);
  const logsOf = (studentId?: string | null): StudentQuestionLog[] => (studentId && logsByStudent.get(studentId)) || NO_LOGS;
  const activeLogs = useMemo(() => (activeStudent && logsByStudent.get(activeStudent.id)) || NO_LOGS, [logsByStudent, activeStudent]);

  // Aşama 15: açılan öğrencinin eski geçmişi ve seçilen eski hafta/ay ihtiyaç olunca buluttan okunur
  useEffect(() => {
    if (activeStudent?.id) dataService.ensureStudentQuestionHistory(activeStudent.id);
  }, [activeStudent?.id]);

  // Belirli bir öğrencinin bugün kaç soru çözdüğünü döndürür
  const getStudentTodayQuestionCount = (studentId: string): number => todayCountByStudent.get(studentId) || 0;

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
    basariBildir(`${targetStudentName} öğrencisine tebrik gönderildi.`); // Aşama 348: ortak bildirim
  };

  // Aşama 43: öğrencinin haftası, öğretmenin haftalık planının başladığı günden başlar (plan yoksa Pazartesi)
  const weekStartDay = dataService.getStudentWeekStartDay(activeStudent?.id);
  // Aktif öğrenci için haftalık analitik
  const targetWeekDate = useMemo(() => {
    const d = parseIsoDate(todayIsoStr) || new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset, todayIsoStr]);
  useEffect(() => {
    const weekFrom = getWeekStartOf(targetWeekDate, weekStartDay);
    weekFrom.setDate(weekFrom.getDate() - 7); // önceki haftayla karşılaştırma
    const monthFrom = new Date(monthDate.year, monthDate.month - 1, 1); // önceki ayla karşılaştırma
    dataService.ensureQuestionLogsFrom(formatDateISO(weekFrom < monthFrom ? weekFrom : monthFrom));
  }, [targetWeekDate, monthDate, weekStartDay]);

  const currentWeekStartDate = useMemo(() => {
    const mon = getWeekStartOf(targetWeekDate, weekStartDay);
    return formatDateISO(mon);
  }, [targetWeekDate, weekStartDay]);

  const currentWeekEndDate = useMemo(() => {
    const mon = getWeekStartOf(targetWeekDate, weekStartDay);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return formatDateISO(sun);
  }, [targetWeekDate, weekStartDay]);

  // Bu haftaya denk gelen hedefler (önce benim verdiğim). Başka haftanın hedefi gösterilmez.
  const activeTargets = useMemo(() => {
    if (!activeStudent) return [] as WeeklyQuestionTarget[];
    return dataService.getQuestionTargetsForStudent(activeStudent.id, currentWeekStartDate, currentWeekEndDate);
  }, [activeStudent, currentWeekStartDate, currentWeekEndDate, targetUpdateTrigger, allLogs]);
  const activeWeeklyTarget = activeTargets[0] || null;
  // Aşama 66: plandan gelen ders hedefleri gün gün duvarlarda gösterilir (öğrencinin Soru Sayısı bölümüyle aynı);
  // tablodaki hedef satırlarından çıkarılır. Plan toplamı olan genel hedef (plan aynası) de satır olarak gösterilmez.
  const planWallTargets = useMemo(() => activeTargets.filter((t) => isPlanCountTarget(t) && isFlexTarget(t)), [activeTargets]);
  const planWall = usePlanWallData(planWallTargets, activeStudent?.id || '', activeLogs);
  const hidePlanRow = React.useCallback(
    (t: WeeklyQuestionTarget) => planWallTargets.includes(t) || isPlanMirrorTarget(t, activeTargets),
    [planWallTargets, activeTargets]
  );
  const myActiveTarget = activeTargets.find((t) => dataService.isMyQuestionTarget(t) && dataService.canEditQuestionTarget(t)) || null;
  // Günlük hedef çizgisi: bu haftanın GENEL (ders seçilmemiş) hedefinin günlük sayısı, yoksa 50.
  // Ders hedefi (ör. yalnızca Matematik) tüm derslerin toplamıyla karşılaştırılmaz. Öğrenci ekranıyla aynı kural.
  // ("Soru Hedefi" kartı ise activeWeeklyTarget'ı göstermeye devam eder.)
  const dailyQuestionTarget = generalDailyTarget(activeTargets);
  const activeTargetProgress = useMemo(
    () => (activeStudent && activeWeeklyTarget ? dataService.questionTargetProgress(activeWeeklyTarget, activeStudent.id, activeLogs) : null),
    [activeStudent, activeWeeklyTarget, activeLogs]
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
      activeLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || activeClass?.name || 'Sınıf Belirtilmedi',
      targetWeekDate,
      weekStartDay
    );
  }, [activeLogs, activeStudent, activeClass, targetWeekDate, weekStartDay]);

  // Öğrencinin geçmiş haftaları ve soru sayıları (Açılır pencere için)
  const pastWeeksList = useMemo(() => {
    const currentMonday = getWeekStartOf(new Date(), weekStartDay);
    const studentLogs = activeLogs;

    // En az 26 hafta (yaklaşık 6 ay), eğer daha eski log varsa listeyi o tarihe kadar genişlet
    let maxPastWeeks = 26;
    if (studentLogs.length > 0) {
      studentLogs.forEach((l) => {
        if (l.date) {
          const logDate = new Date(l.date + 'T00:00:00');
          if (!isNaN(logDate.getTime())) {
            const logMonday = getWeekStartOf(logDate, weekStartDay);
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
  }, [activeLogs, activeStudent?.id, todayIsoStr, weekStartDay]);

  // Filtrelenmiş geçmiş haftalar
  const filteredPastWeeks = useMemo(() => {
    return pastWeeksList.filter((item) => {
      if (weekFilterTab === 'with_questions' && !item.hasActivity) {
        return false;
      }
      if (weekSearchQuery.trim()) {
        const q = weekSearchQuery.trim(); // Aşama 116: Türkçe harf duyarsız
        const matchesLabel = matchTurkishSearch(item.weekLabel, q);
        const matchesRel = matchTurkishSearch(item.relativeLabel, q);
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
    const studentLogs = activeLogs;
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
  }, [activeLogs, activeStudent?.id, todayIsoStr]);

  const filteredPastMonths = useMemo(() => {
    return pastMonthsList.filter((item) => {
      if (monthFilterTab === 'with_questions' && !item.hasActivity) {
        return false;
      }
      if (monthSearchQuery.trim()) {
        const q = monthSearchQuery.trim(); // Aşama 116: Türkçe harf duyarsız
        const matchesLabel = matchTurkishSearch(item.monthLabel, q);
        const matchesRel = matchTurkishSearch(item.relativeLabel, q);
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
      activeLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || activeClass?.name || 'Sınıf Belirtilmedi',
      monthDate.year,
      monthDate.month
    );
  }, [activeLogs, activeStudent, activeClass, monthDate]);

  // Sınıf genel özeti & sıralaması
  const classOverviewData = useMemo(() => {
    if (classStudents.length === 0) return [];
    const classNameStr = activeClass?.name || 'Sınıf';
    return classStudents.map((st) => {
      const stLogs = logsOf(st.id);
      const stWeekly = computeWeeklyAnalytics(
        stLogs,
        st.id,
        st.name,
        st.className || classNameStr,
        targetWeekDate,
        dataService.getStudentWeekStartDay(st.id)
      );
      const stMonthly = computeMonthlyAnalytics(
        stLogs,
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
  }, [activeClass, classStudents, logsByStudent, targetWeekDate, monthDate]);

  // Aşama 225 (HIZ): sıralama tablosu ve öğrenci kartları parça parça çizilir (önce 15, hemen ardından 50; sonra
  // "daha fazla göster"). "Tüm Sınıflar"da yüzlerce satır bir anda çizilip telefonu donduruyordu. Sıralama değişmez.
  const overviewById = useMemo(() => new Map(classOverviewData.map((d) => [d.student.id, d])), [classOverviewData]);
  const ovPage = usePagedList(classOverviewData, selectedClassId, 50, 15);
  const cardPage = usePagedList(classStudents, selectedClassId, 50, 15);
  // Aşama 225: "Bugün soru çözen öğrenciler" kartları da parça parça (kalabalık okulda hepsi bir anda çiziliyordu)
  const todaySolvedStudents = useMemo(
    () =>
      students
        .map((s) => ({ student: s, todayQuestions: todayCountByStudent.get(s.id) || 0 }))
        .filter((x) => x.todayQuestions > 0),
    [students, todayCountByStudent]
  );
  const todayPage = usePagedList(todaySolvedStudents, 'today', 50, 15);

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
  }, [classStudents, classOverviewData, todayCountByStudent]);

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
            <span className="px-2 py-0.5 rounded-full text-2xs font-semibold bg-brand-soft text-brand-fg border border-brand/30">
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
                <span className="flex items-center gap-1 text-success-fg">
                  <span className="w-2 h-2 rounded-full bg-success" /> Doğru:
                </span>
                <span className="font-bold text-success-fg">{data.totalCorrect}</span>
              </div>
            )}

            {data.totalWrong !== undefined && data.totalWrong > 0 && (
              <div className="flex justify-between items-center text-muted">
                <span className="flex items-center gap-1 text-danger-fg">
                  <span className="w-2 h-2 rounded-full bg-danger" /> Yanlış:
                </span>
                <span className="font-bold text-danger-fg">{data.totalWrong}</span>
              </div>
            )}

            {data.totalQuestions >= dailyQuestionTarget ? (
              <div className="text-xs text-success-fg font-semibold flex items-center gap-1 pt-1 border-t border-line">
                <CheckCircle2 className="w-3 h-3 text-success-fg" />
                <span>Günlük Hedefe Ulaşıldı (%{Math.round((data.totalQuestions / dailyQuestionTarget) * 100)})</span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-xs text-brand-fg font-medium pt-1 border-t border-line">
                Hedefe {dailyQuestionTarget - data.totalQuestions} soru kaldı
              </div>
            ) : (
              <div className="text-xs text-danger-fg font-medium flex items-center gap-1 pt-1 border-t border-line">
                <AlertCircle className="w-3 h-3 text-danger-fg" />
                <span>Bu gün soru çözülmedi</span>
              </div>
            )}

            {data.subjectsText && (
              <div className="pt-1 border-t border-line text-2xs text-muted truncate max-w-[200px]">
                {data.subjectsText}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return {
    classes,
    students,
    selectedClassId,
    setSelectedClassId,
    selectedStudentId,
    setSelectedStudentId,
    activeStudent,
    activeClass,
    classStudents,
    isStudentDropdownOpen,
    setIsStudentDropdownOpen,
    studentSearchQuery,
    setStudentSearchQuery,
    dropdownScope,
    setDropdownScope,
    studentDropdownRef,
    handleSelectClass,
    handleSelectStudent,
    studentNotifications,
    setStudentNotifications,
    praiseTargetDay,
    setPraiseTargetDay,
    praiseCustomMessage,
    setPraiseCustomMessage,
    activeAnalysisMode,
    setActiveAnalysisMode,
    chartVisualType,
    setChartVisualType,
    targetForm,
    setTargetForm,
    targetUpdateTrigger,
    setTargetUpdateTrigger,
    setMailNotice,
    weekOffset,
    setWeekOffset,
    monthDate,
    setMonthDate,
    isWeekModalOpen,
    setIsWeekModalOpen,
    weekFilterTab,
    setWeekFilterTab,
    weekSearchQuery,
    setWeekSearchQuery,
    isMonthModalOpen,
    setIsMonthModalOpen,
    monthFilterTab,
    setMonthFilterTab,
    monthSearchQuery,
    setMonthSearchQuery,
    allLogs,
    setAllLogs,
    isManageLogsModalOpen,
    setIsManageLogsModalOpen,
    todayIsoStr,
    isNarrow,
    logsByStudent,
    todayCountByStudent,
    logsOf,
    activeLogs,
    getStudentTodayQuestionCount,
    filteredDropdownStudents,
    isPraisedForDate,
    handleOpenPraiseModal,
    handleSendPraise,
    weekStartDay,
    targetWeekDate,
    currentWeekStartDate,
    currentWeekEndDate,
    activeTargets,
    activeWeeklyTarget,
    planWallTargets,
    planWall,
    hidePlanRow,
    myActiveTarget,
    dailyQuestionTarget,
    activeTargetProgress,
    isStudentTargetsModalOpen,
    setIsStudentTargetsModalOpen,
    isClassTargetsModalOpen,
    setIsClassTargetsModalOpen,
    studentTargetsCount,
    classTargetsCount,
    openNewTarget,
    openEditTarget,
    handleOpenStudentTargetModal,
    handleOpenClassTargetModal,
    handleTargetSaved,
    weeklyAnalytics,
    pastWeeksList,
    filteredPastWeeks,
    activeWeeksCount,
    pastMonthsList,
    filteredPastMonths,
    activeMonthsCount,
    monthlyAnalytics,
    classOverviewData,
    overviewById,
    ovPage,
    cardPage,
    todaySolvedStudents,
    todayPage,
    classSummaryStats,
    weeklyTargetTotal,
    weeklyTargetSolved,
    weeklyTargetCompletionRate,
    monthlyPlan,
    monthlyTargetTotal,
    monthlyTargetCompletionRate,
    renderLookerTooltip,
  };
}

export type SoruTakibiBaglamDegeri = ReturnType<typeof useSoruTakibi>;
export const SoruTakibiBaglam = createContext<SoruTakibiBaglamDegeri | null>(null);
export function useSoruTakibiBaglam(): SoruTakibiBaglamDegeri {
  const d = useContext(SoruTakibiBaglam);
  if (!d) throw new Error('SoruTakibiBaglam sağlayıcısı yok');
  return d;
}
