// Öğrenci soru modülü: sayfanın bütün durumu ve işlemleri (Aşama 354c). Görünüm parçaları bunu useSoruModuluBaglam() ile okur.
import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { StudentQuestionLog, QuestionLogSubjectEntry } from '../../../types';
import { dataService } from '../../../services/dataService';
import { computeWeeklyAnalytics, computeMonthlyAnalytics, formatTurkishDate, formatDateISO, getWeekStartOf, TURKISH_MONTHS, getStudentQuestionSubjects } from '../../../utils/questionAnalytics';
import { computeTargetDays, isPlanMirrorTarget, subjectTargetForDay, targetForDay, weekDayGoal, type TargetDayRow } from '../../../utils/targetDays';
import { readQuestionSubTab, readStudentTab, pushQuestionSubTab, type QuestionSubTab } from '../../../lib/studentRoute';
import { addDaysYmd, dateOfDay, loadMyCurrentWeek, type PlanItem } from '../../../services/studyPlanService';
import { normalizeSubject, targetSubjectList } from '../../../lib/subjects';
import { matchTurkishSearch } from '../../../utils/turkishSearch';
import { useBildirimKanali } from '../../../lib/bildirim';
import { MAX_QUESTION_COUNT, QUESTION_ENTRY_MAX_PAST_DAYS, parseIsoDate, generalDailyTarget, computeMonthlyTargetPlan, useTodayIso, useIsNarrowScreen, EntryRow, emptyEntryRow, rowHasContent, checkEntryRow, mergeSubjectEntries, buildEntryRows, hedefTazeleme, StudentQuestionModuleProps, useChartsAfterPaint } from './ortak';

export function useSoruModulu({
  currentStudent,
  classes,
  students,
}: StudentQuestionModuleProps) {
  // Sınıf ve öğrenci seçimi (varsayılan aktif öğrenci)
  const [selectedClassId, setSelectedClassId] = useState<string>(currentStudent.classId || '');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(currentStudent.id || '');

  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || currentStudent;
  }, [students, selectedStudentId, currentStudent]);

  const classStudents = useMemo(() => {
    if (!selectedClassId) return students;
    return students.filter((s) => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Görünüm sekmeleri: 'entry' (Soru Girişi) | 'weekly' (Haftalık Analiz) | 'monthly' (Aylık Analiz) | 'history' (Geçmiş Kayıtlar)
  // Alt sekme adreste tutulur (#/student/questions/entry): "Geri" tuşu önceki alt sekmeye döner
  const [activeTab, setActiveTabState] = useState<QuestionSubTab>(() => readQuestionSubTab() || 'weekly');
  const chartsReady = useChartsAfterPaint(); // Aşama 84
  const setActiveTab = (tab: QuestionSubTab) => {
    setActiveTabState(tab);
    pushQuestionSubTab(tab);
  };
  useEffect(() => {
    const onPop = () => {
      if (readStudentTab() === 'questions') setActiveTabState(readQuestionSubTab() || 'weekly');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Grafik görselleştirme tipi: 'bar' (Sütun) | 'area' (Trend & Alan)
  const [chartVisualType, setChartVisualType] = useState<'bar' | 'area'>('bar');

  // Yerel "bugün" (gece yarısından sonra kendiliğinden yenilenir)
  const todayIso = useTodayIso();
  const isNarrow = useIsNarrowScreen();
  // Aşama 64: grafiğin gün adları 900 px altında kısaltılır (Pzt, Sal …): uzun adlar sığmayıp üst üste binmesin
  const shortDayLabels = useIsNarrowScreen(899);

  // Tarih ve dönem ofsetleri
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthDate, setMonthDate] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  // Açılır pencere (Pop-up modal) kontrolleri
  const [isWeekModalOpen, setIsWeekModalOpen] = useState<boolean>(false);
  const [isMonthModalOpen, setIsMonthModalOpen] = useState<boolean>(false);
  const [weekSearchQuery, setWeekSearchQuery] = useState<string>('');
  const [monthSearchQuery, setMonthSearchQuery] = useState<string>('');

  // Aşama 191: hafta / ay pencerelerinde Esc ortak katmandan (OverlayLayer)

  // Form input mode: 'list' (Tüm derslerin karşısına yazma) or 'single' (Tek ders seçip yazma)
  const [inputMode, setInputMode] = useState<'list' | 'single'>('list');

  // Soru giriş formu
  // Öğrenci tarihi kendisi seçmediyse tarih her zaman "bugün"dür (gece yarısı geçince de güncellenir)
  const [entryDate, setEntryDate] = useState<string>(todayIso);
  const [entryDateTouched, setEntryDateTouched] = useState<boolean>(false);
  useEffect(() => {
    if (!entryDateTouched) setEntryDate(todayIso);
  }, [todayIso, entryDateTouched]);
  const [entryNotes, setEntryNotes] = useState<string>('');
  const setSaveSuccessMsg = useBildirimKanali(); // Aşama 353: ortak bildirim
  const [submitAttempted, setSubmitAttempted] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const successTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
  }, []);

  const minEntryDate = useMemo(() => {
    const d = parseIsoDate(todayIso) || new Date();
    d.setDate(d.getDate() - QUESTION_ENTRY_MAX_PAST_DAYS);
    return formatDateISO(d);
  }, [todayIso]);

  const dateError = useMemo(() => {
    if (!entryDate) return 'Soru çözdüğün tarihi seçmelisin.';
    if (!parseIsoDate(entryDate)) return 'Geçerli bir tarih seçmelisin.';
    if (entryDate > todayIso) return `İleri bir tarih seçemezsin; en geç bugün (${formatTurkishDate(todayIso)}) olabilir.`;
    if (entryDate < minEntryDate)
      return `En fazla ${QUESTION_ENTRY_MAX_PAST_DAYS} gün öncesine (${formatTurkishDate(minEntryDate)}) kayıt girebilirsin.`;
    return '';
  }, [entryDate, todayIso, minEntryDate]);

  const activeSubjects = useMemo(() => {
    return getStudentQuestionSubjects(activeStudent, classes);
  }, [activeStudent, classes]);

  const [listRows, setListRows] = useState<EntryRow[]>(() => {
    const subs = getStudentQuestionSubjects(currentStudent, classes);
    return subs.map((sub) => emptyEntryRow(sub));
  });

  useEffect(() => {
    setListRows((prev) => {
      const base = activeSubjects.map((sub) => prev.find((p) => p.subject === sub) || emptyEntryRow(sub));
      // Ders listesinde olmayan ama kayıtta bulunan (dolu) dersler kaybolmaz
      const extras = prev.filter((p) => !activeSubjects.includes(p.subject) && rowHasContent(p));
      return [...base, ...extras];
    });
  }, [activeSubjects]);

  const [singleSubject, setSingleSubject] = useState<string>(() => activeSubjects[0] || 'Matematik');
  const [singleCount, setSingleCount] = useState<string>('');
  const [singleCorrect, setSingleCorrect] = useState<string>('');
  const [singleWrong, setSingleWrong] = useState<string>('');
  const [singleTopic, setSingleTopic] = useState<string>('');
  const [singleEntries, setSingleEntries] = useState<QuestionLogSubjectEntry[]>([]);
  const [singleError, setSingleError] = useState<string>('');
  const setSingleInfo = useBildirimKanali(); // Aşama 353: ortak bildirim

  // Soru logları aboneliği
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    }, ['hedef', 'soru']); // Aşama 349b
    return unsub;
  }, []);

  // Seçili tarihte daha önce kaydedilmiş kayıt (varsa form bu kaydı düzenler)
  const sameDayLogs = useMemo(
    () => allLogs.filter((l) => l.studentId === activeStudent.id && l.date === entryDate),
    [allLogs, activeStudent.id, entryDate]
  );
  const existingLog = sameDayLogs[0] || null;
  const isEditMode = !!existingLog;
  const existingLogKey = existingLog ? existingLog.id : '';

  // Aşama 66: kaydın İÇERİĞİ (ders ve sayılar). Ana sayfada plan görevi "yaptım" işaretlenince görevin soruları
  // aynı günün kaydına eklenir; kaydın kimliği değişmediği için form eskiden yenilenmiyordu (Fizik 48 görünmüyordu,
  // öğrenci formu kaydederse eklenen sorular siliniyordu). İçerik değişince form da güncellenir (aşağıdaki etki).
  const existingContentSig = useMemo(
    () =>
      JSON.stringify(
        mergeSubjectEntries(sameDayLogs.flatMap((l) => l.entries || [])).map((e) => [
          e.subject,
          Number(e.questionCount) || 0,
          Number(e.correctCount) || 0,
          Number(e.wrongCount) || 0,
        ])
      ),
    [sameDayLogs]
  );
  const loadedRowsRef = useRef<EntryRow[]>([]);
  const loadedSigRef = useRef<string>('');

  // Tarih (veya öğrenci) değişince: o günün kaydı varsa derslerini forma yükle; kayıt yoksa ve
  // form başka bir günün kaydını gösteriyorsa formu boşalt. Yazılmakta olan yeni giriş korunur.
  const loadedLogIdRef = useRef<string | null>(null);
  const savingRef = useRef<boolean>(false);
  useEffect(() => {
    if (savingRef.current) {
      // Kaydetme sürerken (veya bulut hatasıyla geri alınırken) form içeriği korunur
      loadedLogIdRef.current = existingLog ? existingLog.id : null;
      return;
    }
    if (existingLog) {
      const merged = mergeSubjectEntries(sameDayLogs.flatMap((l) => l.entries || []));
      setListRows(buildEntryRows(activeSubjects, merged));
      setSingleEntries(merged);
      setEntryNotes(existingLog.notes || '');
      loadedLogIdRef.current = existingLog.id;
      loadedRowsRef.current = buildEntryRows(activeSubjects, merged);
      loadedSigRef.current = existingContentSig;
    } else if (loadedLogIdRef.current) {
      setListRows(activeSubjects.map((s) => emptyEntryRow(s)));
      setSingleEntries([]);
      setEntryNotes('');
      loadedLogIdRef.current = null;
      loadedRowsRef.current = [];
      loadedSigRef.current = '';
    }
    setSubmitAttempted(false);
    setFormError('');
    setSingleError('');
    setSingleInfo('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent.id, entryDate, existingLogKey]);

  // Aşama 66: aynı günün kaydı başka yerden değişti (ör. ana sayfada plan görevi işaretlendi → Fizik 48 eklendi).
  // Öğrencinin formda DEĞİŞTİRMEDİĞİ dersler kayıttaki yeni sayılarla güncellenir, kayıtta olup formda olmayan ders eklenir;
  // öğrencinin o anda yazdığı (kaydetmediği) sayılara dokunulmaz.
  useEffect(() => {
    if (!existingLog || loadedLogIdRef.current !== existingLog.id) return;
    if (loadedSigRef.current === existingContentSig) return;
    const merged = mergeSubjectEntries(sameDayLogs.flatMap((l) => l.entries || []));
    const fresh = buildEntryRows(activeSubjects, merged);
    const before = loadedRowsRef.current;
    loadedRowsRef.current = fresh;
    loadedSigRef.current = existingContentSig;
    if (savingRef.current) return; // kendi kaydımız: form zaten bu içeriği gösteriyor
    const same = (a?: EntryRow, b?: EntryRow) =>
      (a?.questionCount || '') === (b?.questionCount || '') && (a?.correctCount || '') === (b?.correctCount || '') && (a?.wrongCount || '') === (b?.wrongCount || '');
    setListRows((prev) => {
      const next = prev.map((r) => {
        const old = before.find((x) => x.subject === r.subject);
        const nw = fresh.find((x) => x.subject === r.subject);
        if (!same(r, old)) return r; // öğrenci bu satırı değiştirmiş: korunur
        return nw
          ? { ...r, questionCount: nw.questionCount, correctCount: nw.correctCount, wrongCount: nw.wrongCount, topic: r.topic || nw.topic }
          : { ...r, questionCount: '', correctCount: '', wrongCount: '' };
      });
      for (const nw of fresh) if (!next.some((r) => r.subject === nw.subject)) next.push(nw);
      return next;
    });
    setSingleEntries((prev) => {
      const prevSig = JSON.stringify(prev.map((e) => [e.subject, Number(e.questionCount) || 0]));
      const beforeSig = JSON.stringify(
        before.filter((r) => r.questionCount).map((r) => [r.subject, Number(r.questionCount) || 0])
      );
      return prevSig === beforeSig ? merged : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingContentSig]);

  // Satır doğrulaması (her değişiklikte)
  const rowChecks = useMemo(() => listRows.map((r) => checkEntryRow(r)), [listRows]);
  const rowsWithErrors = useMemo(
    () => listRows.filter((_, i) => rowChecks[i].errors.length > 0).map((r) => r.subject),
    [listRows, rowChecks]
  );
  const listTotal = useMemo(() => rowChecks.reduce((s, c) => s + (c.count || 0), 0), [rowChecks]);
  const singleTotal = useMemo(() => singleEntries.reduce((s, e) => s + (e.questionCount || 0), 0), [singleEntries]);
  const formTotal = inputMode === 'list' ? listTotal : singleTotal;

  // ---------------------------------------------------------------------------
  // Seçilen günün soru hedefleri: her ders satırında "bugün girmen gereken" sayı gösterilir,
  // girilen sayı hedefin altındaysa satırda yanıp sönen uyarı çıkar.
  // ---------------------------------------------------------------------------
  const entryDayTargets = useMemo(
    () => (parseIsoDate(entryDate) ? dataService.getQuestionTargetsForStudent(activeStudent.id, entryDate, entryDate) : []),
    // allLogs: veri servisi her değiştiğinde (hedef eklenince/değişince de) yeniden hesaplanır
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeStudent.id, entryDate, allLogs]
  );
  /** Bir dersin seçilen gündeki hedefi (o derse ayrı hedef yoksa null). Birden çok öğretmen hedef verdiyse en büyüğü. */
  const subjectDayTarget = (subject: string): number | null => {
    let best: number | null = null;
    for (const t of entryDayTargets) {
      const n = subjectTargetForDay(t, subject, entryDate);
      if (n !== null && (best === null || n > best)) best = n;
    }
    return best;
  };
  /** Seçilen günün genel (tüm dersler) hedefi; yoksa null */
  const generalDayTarget = useMemo(() => {
    let best: number | null = null;
    for (const t of entryDayTargets) {
      if (t.subject) continue;
      const n = targetForDay(t, entryDate);
      if (n > 0 && (best === null || n > best)) best = n;
    }
    return best;
  }, [entryDayTargets, entryDate]);

  // ---------------------------------------------------------------------------
  // Günlük plan (öğretmenin gönderdiği çalışma planı): seçilen günün görevleri.
  // Öğrenci isterse görevi küçük bir butonla "Çalışılan Konu / Test" kutusuna aktarır.
  // ---------------------------------------------------------------------------
  const [planTasks, setPlanTasks] = useState<PlanItem[]>([]);
  useEffect(() => {
    if (activeTab !== 'entry') return;
    const day = parseIsoDate(entryDate);
    if (!day) {
      setPlanTasks([]);
      return;
    }
    let cancelled = false;
    loadMyCurrentWeek(day)
      .then((r) => {
        if (cancelled) return;
        setPlanTasks(r.items.filter((i) => dateOfDay(r.weekStart, i.day) === entryDate));
      })
      .catch(() => {
        if (!cancelled) setPlanTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, entryDate]);

  const sameSubject = (a: string, b: string) =>
    normalizeSubject(a).toLocaleLowerCase('tr-TR') === normalizeSubject(b).toLocaleLowerCase('tr-TR');
  const planTaskText = (it: PlanItem) => [it.book, it.note].map((s) => (s || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' – ');
  // Aşama 52: öğretmenin otomatik aktardığı derslerin görevleri tekrar önerilmez (yalnızca aktarılmayanlar)
  const planTasksFor = (subject: string) => manualPlanTasks.filter((it) => sameSubject(it.subject, subject) && planTaskText(it));
  /** Konu kutusuna görev metnini ekler (kutuda yazı varsa sonuna virgülle eklenir, aynısı tekrar eklenmez) */
  const appendTopic = (current: string, text: string) => {
    const cur = current.trim();
    if (!text || cur.includes(text)) return cur;
    return (cur ? `${cur}, ${text}` : text).slice(0, 120);
  };
  const setPlanInfo = useBildirimKanali(); // Aşama 353: ortak bildirim
  const transferPlanTasks = (subject: string, tasks: PlanItem[]) => {
    const text = tasks.map(planTaskText).filter(Boolean).join(', ');
    if (!text) return;
    clearMessages();
    if (inputMode === 'list') {
      setListRows((prev) => {
        const idx = prev.findIndex((r) => sameSubject(r.subject, subject));
        if (idx >= 0) return prev.map((r, i) => (i === idx ? { ...r, topic: appendTopic(r.topic, text) } : r));
        // Ders listede yoksa yeni satır olarak eklenir (soru sayısını öğrenci yazar)
        return [...prev, { ...emptyEntryRow(normalizeSubject(subject)), topic: text.slice(0, 120) }];
      });
    } else {
      const match = activeSubjects.find((s) => sameSubject(s, subject));
      if (match) setSingleSubject(match);
      setSingleTopic((cur) => appendTopic(match && sameSubject(singleSubject, match) ? cur : '', text));
    }
    setPlanInfo(`${normalizeSubject(subject)}: plandaki görev konu kutusuna aktarıldı.`);
  };

  // ---------------------------------------------------------------------------
  // Öğretmenin "Soru takibine aktar" düğmesiyle gönderdiği konular: seçilen günün konuları
  // ilgili dersin "Çalışılan Konu / Test" kutusuna kendiliğinden yazılır (kutu boşsa; yazılanın üstüne yazılmaz).
  // ---------------------------------------------------------------------------
  const teacherTopics = useMemo(
    () => (parseIsoDate(entryDate) ? dataService.getPlanTopicsForStudentDay(activeStudent.id, entryDate) : []),
    // allLogs: veri servisi her değiştiğinde (hedef eklenince/değişince de) yeniden hesaplanır
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeStudent.id, entryDate, allLogs]
  );
  const teacherTopicsSig = teacherTopics.map((x) => `${x.subject}:${x.topic}`).join('|');
  // Aşama 52: öğretmen planı gönderip görevleri otomatik aktardıysa o derslerin görevleri "günlük planındaki görevler"
  // kutusunda gösterilmez (zaten ders satırına yazıldı). Aktarılmamış görevler kalırsa kutu çıkar; öğrenci isterse elle ekler.
  const manualPlanTasks = useMemo(
    () => planTasks.filter((it) => !teacherTopics.some((x) => sameSubject(x.subject, it.subject))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planTasks, teacherTopicsSig]
  );
  // ---------------------------------------------------------------------------
  // Aşama 53: KONULARIN GÜNE DOĞRU YAZILMASI (senkronizasyon hatasının kökten çözümü)
  // Eski sürümde bir günün konusu ders satırına yazılınca, tarih değiştirildiğinde satırda KALIYORDU:
  // Pazartesi'nin görevi Salı ve Çarşamba'da da görünüyor, o günlerin (ör. Cuma'nın) kendi görevi ise
  // "kutu dolu" diye yazılmıyordu. Artık sistemin yazdığı metin hatırlanır:
  //  * Gün değişince sistemin yazdığı (öğrencinin değiştirmediği) konu silinir, yerine o günün konusu yazılır.
  //  * Öğrencinin kendi yazdığı ya da o günün kayıtlı girişinden gelen konuya dokunulmaz.
  //  * Yalnızca plan yüzünden eklenmiş, artık boş kalan ders satırları kaldırılır.
  // ---------------------------------------------------------------------------
  const teacherTopicsAppliedRef = useRef<string>('');
  const autoTopicsRef = useRef<Map<string, string>>(new Map()); // ders anahtarı → sistemin yazdığı konu
  const autoSingleRef = useRef<string>(''); // tek tek giriş modunda sistemin yazdığı konu
  const lastAutoCtxRef = useRef<string>('');
  useEffect(() => {
    if (dateError) return;
    const ctx = `${activeStudent.id}|${entryDate}`;
    const sig = `${ctx}|${existingLogKey}|${teacherTopicsSig}`;
    if (teacherTopicsAppliedRef.current === sig) return;
    teacherTopicsAppliedRef.current = sig;
    // Yeni güne geçildiyse ve o günün kayıtlı girişi varsa: satırlar kayıttan geldi, onlara dokunulmaz
    // (yalnızca boş konu kutuları doldurulur). Kayıt yoksa satırlarda önceki günün otomatik konusu kalmış olabilir.
    const dayChanged = lastAutoCtxRef.current !== ctx;
    lastAutoCtxRef.current = ctx;
    const prevAuto = dayChanged && existingLog ? new Map<string, string>() : autoTopicsRef.current;
    const keyOf = (s: string) => normalizeSubject(s).toLocaleLowerCase('tr-TR');
    const wanted = new Map<string, { subject: string; topic: string }>();
    for (const x of teacherTopics) wanted.set(keyOf(x.subject), { subject: x.subject, topic: x.topic.slice(0, 120) });
    const nextAuto = new Map<string, string>();
    setListRows((prev) => {
      nextAuto.clear();
      const next = prev.map((r) => {
        const k = keyOf(r.subject);
        const cur = r.topic.trim();
        const was = prevAuto.get(k);
        const ownedBySystem = !cur || (was !== undefined && cur === was.trim());
        if (!ownedBySystem) return r; // öğrencinin yazdığı / kayıttan gelen konu korunur
        const w = wanted.get(k);
        if (w) {
          nextAuto.set(k, w.topic);
          return cur === w.topic ? r : { ...r, topic: w.topic };
        }
        return cur ? { ...r, topic: '' } : r; // önceki günden kalan otomatik konu temizlenir
      });
      for (const [k, w] of wanted) {
        if (next.some((r) => keyOf(r.subject) === k)) continue;
        // Ders öğrencinin listesinde yoksa yeni satır olarak eklenir (soru sayısını öğrenci yazar)
        next.push({ ...emptyEntryRow(normalizeSubject(w.subject)), topic: w.topic });
        nextAuto.set(k, w.topic);
      }
      // Yalnızca plan yüzünden eklenmiş ve artık boş kalan satırlar kaldırılır
      const cleaned = next.filter((r) => activeSubjects.includes(r.subject) || rowHasContent(r));
      autoTopicsRef.current = new Map(nextAuto);
      return cleaned;
    });
    // Tek tek giriş modu: seçili dersin konu kutusu
    const singleMatch = wanted.get(keyOf(singleSubject));
    setSingleTopic((cur) => {
      const c = cur.trim();
      const owned = !c || (!(dayChanged && existingLog) && c === autoSingleRef.current.trim());
      if (!owned) return cur;
      autoSingleRef.current = singleMatch ? singleMatch.topic : '';
      return singleMatch ? singleMatch.topic : '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent.id, entryDate, teacherTopicsSig, dateError, existingLogKey]);

  // Aşama 53: GELECEK HAFTA HEDEFİN — öğretmenin haftalık plandan (ya da elle) verdiği, bugünden sonra başlayan
  // ilk hedef haftası gün gün: her gün hangi dersten kaç soru ve plandaki konu.
  const nextWeekPlan = useMemo(() => {
    const today = todayIso;
    const list = dataService
      .getQuestionTargetsForStudent(activeStudent.id, addDaysYmd(today, 1), addDaysYmd(today, 21))
      .filter((t) => (t.weekStartDate || '') > today);
    if (!list.length) return null;
    const start = list.map((t) => t.weekStartDate || '').sort()[0];
    const dates = Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i));
    const days = dates.map((d) => {
      const bySubject = new Map<string, number>();
      let general = 0;
      for (const t of list) {
        const subs = targetSubjectList(t.subject);
        if (!subs.length) {
          general = Math.max(general, targetForDay(t, d));
          continue;
        }
        for (const s of subs) {
          const n = subjectTargetForDay(t, s, d);
          if (n && n > (bySubject.get(s) || 0)) bySubject.set(s, n);
        }
      }
      return { date: d, subjects: Array.from(bySubject.entries()), general, topics: dataService.getPlanTopicsForStudentDay(activeStudent.id, d) };
    });
    if (!days.some((x) => x.subjects.length || x.general > 0)) return null;
    return { start, end: dates[6], days };
    // allLogs: veri servisi her değiştiğinde (hedef eklenince/değişince de) yeniden hesaplanır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent.id, todayIso, allLogs]);

  // Aşama 53: öğrenci Soru Kaydet'i açınca / gün değiştirince öğretmenin son aktarımları buluttan tazelenir
  // (telefonda uygulama uzun süre açık kalsa da eski konu / hedef görünmesin). En fazla 20 sn'de bir.
  useEffect(() => {
    if (activeTab !== 'entry') return;
    const now = Date.now();
    if (now - hedefTazeleme.son < 20000) return;
    hedefTazeleme.son = now;
    void dataService.syncQuestionTargetsFromSupabase(true);
  }, [activeTab, entryDate]);

  const clearMessages = () => {
    setFormError('');
  };

  const updateListRow = (idx: number, field: keyof EntryRow, value: string) => {
    clearMessages();
    setListRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  // Liste ↔ tek tek modu arasında geçişte girilen dersler taşınır
  const switchInputMode = (mode: 'list' | 'single') => {
    if (mode === inputMode) return;
    if (mode === 'single') {
      const entries: QuestionLogSubjectEntry[] = [];
      listRows.forEach((r, i) => {
        const c = rowChecks[i];
        if (c.errors.length === 0 && c.count && c.count > 0) {
          entries.push({
            subject: r.subject,
            questionCount: c.count,
            correctCount: c.correct ?? undefined,
            wrongCount: c.wrong ?? undefined,
            topic: r.topic.trim() || undefined,
          });
        }
      });
      setSingleEntries(mergeSubjectEntries(entries));
    } else {
      setListRows(buildEntryRows(activeSubjects, mergeSubjectEntries(singleEntries)));
    }
    setSingleError('');
    setSingleInfo('');
    setInputMode(mode);
  };

  const handleAddSingleEntry = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setSingleInfo('');
    const check = checkEntryRow({
      subject: singleSubject,
      questionCount: singleCount,
      correctCount: singleCorrect,
      wrongCount: singleWrong,
      topic: singleTopic,
    });
    if (check.errors.length > 0) {
      setSingleError(check.errors.join(' '));
      return;
    }
    if (!check.count || check.count <= 0) {
      setSingleError('Soru sayısını girmelisin (en az 1).');
      return;
    }
    const newEntry: QuestionLogSubjectEntry = {
      subject: singleSubject,
      questionCount: check.count,
      correctCount: check.correct ?? undefined,
      wrongCount: check.wrong ?? undefined,
      topic: singleTopic.trim() || undefined,
    };
    const already = singleEntries.some((x) => x.subject === singleSubject);
    const next = mergeSubjectEntries([...singleEntries, newEntry]);
    const mergedRow = next.find((x) => x.subject === singleSubject);
    if (mergedRow && mergedRow.questionCount > MAX_QUESTION_COUNT) {
      setSingleError(`${singleSubject} için bir günde en fazla ${MAX_QUESTION_COUNT} soru girebilirsin.`);
      return;
    }
    setSingleEntries(next);
    setSingleError('');
    if (already) setSingleInfo(`${singleSubject} listede zaten vardı; sayılar toplandı.`);

    setSingleCount('');
    setSingleCorrect('');
    setSingleWrong('');
    setSingleTopic('');
  };

  const handleRemoveSingleEntry = (index: number) => {
    clearMessages();
    setSingleEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveQuestionLog = async () => {
    if (isSaving) return;
    setSubmitAttempted(true);
    setFormError('');
    setSaveSuccessMsg('');

    if (dateError) return;

    let finalEntries: QuestionLogSubjectEntry[] = [];
    if (inputMode === 'list') {
      if (rowsWithErrors.length > 0) return;
      listRows.forEach((row, i) => {
        const c = rowChecks[i];
        if (c.count && c.count > 0) {
          finalEntries.push({
            subject: row.subject,
            questionCount: c.count,
            correctCount: c.correct ?? undefined,
            wrongCount: c.wrong ?? undefined,
            topic: row.topic.trim() || undefined,
          });
        }
      });
    } else {
      finalEntries = [...singleEntries];
    }
    // Aynı ders iki kez girildiyse sayılar toplanır
    finalEntries = mergeSubjectEntries(finalEntries.filter((e) => (e.questionCount || 0) > 0));

    if (finalEntries.length === 0) {
      setFormError(
        isEditMode
          ? 'En az bir derste soru sayısı girmelisin. Bu günün kaydını tamamen kaldırmak istiyorsan Geçmiş Kayıtlar sekmesindeki sil düğmesini kullan.'
          : 'En az bir derste soru sayısı girmelisin.'
      );
      return;
    }

    const currentClass = classes.find((c) => c.id === activeStudent.classId);
    const wasEdit = isEditMode;
    const savedDate = entryDate;

    setIsSaving(true);
    savingRef.current = true;
    let saved: StudentQuestionLog;
    try {
      saved = await dataService.saveQuestionLog({
        id: existingLog?.id,
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        classId: activeStudent.classId || selectedClassId,
        className: activeStudent.className || currentClass?.name || 'Belirtilmedi',
        date: savedDate,
        entries: finalEntries,
        notes: entryNotes.trim(),
      });
    } catch (err) {
      // Girilen sayılar kaybolmasın diye form temizlenmez
      const msg = err instanceof Error && err.message ? err.message : '';
      setFormError(msg && /[çğıöşüÇĞİÖŞÜ]|soru|kayıt/i.test(msg) ? msg : 'Kayıt yapılamadı, lütfen tekrar dene.');
      // Kayıt geri alındıysa form boşaltılmasın: yüklü kayıt bilgisi kaydetmeden önceki duruma döner
      loadedLogIdRef.current = existingLog ? existingLog.id : null;
      savingRef.current = false;
      setIsSaving(false);
      return;
    }
    savingRef.current = false;
    setIsSaving(false);
    setSubmitAttempted(false);

    const dayLabel = formatTurkishDate(savedDate);
    setSaveSuccessMsg(
      wasEdit
        ? `${dayLabel}: kaydın güncellendi, bu günün toplamı ${saved.totalQuestions} soru.`
        : `${dayLabel}: ${saved.totalQuestions} soru kaydedildi.`
    );
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(''), 15000); // Aşama 99: 15 sn
    // Form, kaydedilen günün içeriğini göstermeye devam eder (artık düzenleme modunda)
  };

  // Geçmiş kayıtlardan "Düzenle": o günü giriş sekmesinde aç
  const handleEditHistoryLog = (log: StudentQuestionLog) => {
    setSaveSuccessMsg('');
    setEntryDateTouched(true);
    setEntryDate(log.date);
    if (inputMode !== 'list') setInputMode('list');
    setActiveTab('entry');
    window.setTimeout(() => {
      document.getElementById('question-entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // "Bugünün Sorularını Ekle": giriş sekmesini bugünün tarihiyle aç
  const openTodayEntry = () => {
    setEntryDateTouched(false);
    setEntryDate(todayIso);
    setActiveTab('entry');
  };


  // Haftalık analitik hesaplama
  // Aşama 43: öğrencinin haftası, öğretmenin haftalık planının başladığı günden başlar (plan yoksa Pazartesi)
  const weekStartDay = dataService.getStudentWeekStartDay(activeStudent.id);
  const targetWeekDate = useMemo(() => {
    const d = parseIsoDate(todayIso) || new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset, todayIso]);

  const weeklyAnalytics = useMemo(() => {
    return computeWeeklyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || 'Sınıf Belirtilmedi',
      targetWeekDate,
      weekStartDay
    );
  }, [allLogs, activeStudent, targetWeekDate, weekStartDay]);

  // Aylık analitik hesaplama
  const monthlyAnalytics = useMemo(() => {
    return computeMonthlyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || 'Sınıf Belirtilmedi',
      monthDate.year,
      monthDate.month
    );
  }, [allLogs, activeStudent, monthDate]);

  // Öğrenci geçmiş kayıtları
  const studentHistoryLogs = useMemo(() => {
    return allLogs
      .filter((l) => l.studentId === activeStudent.id && (l.totalQuestions || 0) > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, activeStudent.id]);

  // Öğrencinin geçmiş haftaları (Soru sayısı 0 olan geçmiş haftalar tamamen silinir/çıkarılır)
  const pastWeeksList = useMemo(() => {
    const currentMonday = getWeekStartOf(new Date(), weekStartDay);
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent.id);

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

      // SADECE güncel hafta veya soru sayısı > 0 olan geçmiş haftalar eklenir; soru sayısı olmayan geçmiş haftalar tamamen silinir
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
  }, [allLogs, activeStudent.id, todayIso, weekStartDay]);

  // Filtrelenmiş geçmiş haftalar (Arama için)
  const filteredPastWeeks = useMemo(() => {
    return pastWeeksList.filter((item) => {
      if (weekSearchQuery.trim()) {
        const q = weekSearchQuery.trim(); // Aşama 116: Türkçe harf duyarsız
        const matchesLabel = matchTurkishSearch(item.weekLabel, q);
        const matchesRel = matchTurkishSearch(item.relativeLabel, q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastWeeksList, weekSearchQuery]);

  // Öğrencinin geçmiş ayları (Soru sayısı 0 olan geçmiş aylar tamamen silinir/çıkarılır)
  const pastMonthsList = useMemo(() => {
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

      // SADECE güncel ay veya soru sayısı > 0 olan geçmiş aylar eklenir; soru sayısı olmayan geçmiş aylar tamamen silinir
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
  }, [allLogs, activeStudent.id, todayIso]);

  const filteredPastMonths = useMemo(() => {
    return pastMonthsList.filter((item) => {
      if (monthSearchQuery.trim()) {
        const q = monthSearchQuery.trim(); // Aşama 116: Türkçe harf duyarsız
        const matchesLabel = matchTurkishSearch(item.monthLabel, q);
        const matchesRel = matchTurkishSearch(item.relativeLabel, q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastMonthsList, monthSearchQuery]);

  // Hafta gezinme yardımcıları (Yalnızca kayıtlı ve soru çözülmüş haftalar arasında geçiş)
  const currentWeekListIdx = useMemo(() => {
    return pastWeeksList.findIndex((w) => w.offset === weekOffset);
  }, [pastWeeksList, weekOffset]);

  const canGoPreviousWeek = currentWeekListIdx >= 0 && currentWeekListIdx < pastWeeksList.length - 1;
  const canGoNextWeek = currentWeekListIdx > 0;

  const handlePreviousWeek = () => {
    if (canGoPreviousWeek) {
      setWeekOffset(pastWeeksList[currentWeekListIdx + 1].offset);
    }
  };

  const handleNextWeek = () => {
    if (canGoNextWeek) {
      setWeekOffset(pastWeeksList[currentWeekListIdx - 1].offset);
    }
  };

  // Ay gezinme yardımcıları (Yalnızca kayıtlı ve soru çözülmüş aylar arasında geçiş)
  const currentMonthListIdx = useMemo(() => {
    return pastMonthsList.findIndex((m) => m.year === monthDate.year && m.month === monthDate.month);
  }, [pastMonthsList, monthDate]);

  const canGoPreviousMonth = currentMonthListIdx >= 0 && currentMonthListIdx < pastMonthsList.length - 1;
  const canGoNextMonth = currentMonthListIdx > 0;

  const handlePreviousMonth = () => {
    if (canGoPreviousMonth) {
      const target = pastMonthsList[currentMonthListIdx + 1];
      setMonthDate({ year: target.year, month: target.month });
    }
  };

  const handleNextMonth = () => {
    if (canGoNextMonth) {
      const target = pastMonthsList[currentMonthListIdx - 1];
      setMonthDate({ year: target.year, month: target.month });
    }
  };

  // Haftalık tarih aralığı
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

  const activeTargets = useMemo(() => {
    return dataService.getQuestionTargetsForStudent(activeStudent.id, currentWeekStartDate, currentWeekEndDate);
  }, [activeStudent.id, currentWeekStartDate, currentWeekEndDate, allLogs]);
  // Günlük hedef çizgisi: bu haftanın GENEL (ders seçilmemiş) hedefinin günlük sayısı, yoksa 50.
  // Öğretmen ekranı da aynı kuralı kullanır (generalDailyTarget).
  const dailyQuestionTarget = generalDailyTarget(activeTargets);

  // Hedeflerin gün gün hesabı (birleşik günlük tablo, grafik renkleri ve ipucu bunu kullanır).
  // Genel hedef gün gün farklı dağıtıldıysa her günün kendi hedefi geçerlidir.
  const weeklyTargetRows = useMemo(
    () => activeTargets.map((t) => ({ t, res: computeTargetDays(t, activeStudent.id, allLogs, todayIso) })),
    [activeTargets, activeStudent.id, allLogs, todayIso]
  );
  // Aşama 64: plandaki sayılarla doldurulmuş genel / çok dersli hedef (plan aynası) ayrıca gösterilmez ve sayılmaz;
  // günün hedefi plandan gelen ders hedeflerinin toplamıdır (tablo, grafik ve gün gün duvarlar aynı sayıyı gösterir)
  const mirrorTargets = useMemo(() => new Set(activeTargets.filter((t) => isPlanMirrorTarget(t, activeTargets))), [activeTargets]);
  const generalTargetRes = weeklyTargetRows.find((x) => !x.t.subject && !mirrorTargets.has(x.t))?.res || null;
  const subjectTargetRows = weeklyTargetRows.filter((x) => !!x.t.subject && !mirrorTargets.has(x.t));
  // Günün hedefi: genel hedef → o günkü sayısı; yoksa o güne denk gelen ders hedeflerinin toplamı; hiçbiri yoksa 0 (hedef yok).
  // Hedef verilmeyen güne varsayılan bir sayı yazılmaz (grafik ve tablo öğretmenin verdiği hedeflerle birebir aynı).
  const dayGoalRow = (ymdStr: string): TargetDayRow | null => weekDayGoal(ymdStr, weeklyTargetRows).generalRow;
  const dayGoal = (ymdStr: string): number => weekDayGoal(ymdStr, weeklyTargetRows).goal;

  // Aylık hedef: seçilen ayın her günü için o haftanın genel hedefi (yoksa 50) toplanır
  const monthlyPlan = useMemo(
    () => computeMonthlyTargetPlan(activeStudent.id, monthDate.year, monthDate.month),
    [activeStudent.id, monthDate, allLogs]
  );
  const monthlyTargetTotal = monthlyPlan.total;
  const monthlyTargetCompletionRate = useMemo(() => {
    if (!monthlyAnalytics || monthlyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((monthlyAnalytics.totalQuestions / monthlyTargetTotal) * 100));
  }, [monthlyAnalytics, monthlyTargetTotal]);

  // Haftalık grafik verisi: her günün kendi hedefi (hedef verilmeyen günde boş → hedef çizgisi/noktası çizilmez)
  const chartDays = useMemo(
    () =>
      weeklyAnalytics
        ? weeklyAnalytics.days.map((d) => {
            const g = weekDayGoal(d.dateStr, weeklyTargetRows).goal;
            return { ...d, dayTarget: g > 0 ? g : null };
          })
        : [],
    [weeklyAnalytics, weeklyTargetRows]
  );
  const maxDayGoal = chartDays.reduce((m, d) => Math.max(m, d.dayTarget || 0), 0);
  // Aşama 64: grafik yazıları kutunun dışına taşmasın: sol boşluk eksi değil, sayı ekseni en büyük sayının
  // basamak sayısına göre genişler (ör. 150, 1200); sağda ve üstte değer etiketleri için pay bırakılır
  const chartTopValue = (() => {
    const top = Math.max(1, maxDayGoal, ...chartDays.map((d) => d.totalQuestions || 0));
    return top + Math.max(2, Math.ceil(top * 0.15));
  })();
  const yAxisWidth = String(chartTopValue).length * (isNarrow ? 6.5 : 7.5) + (isNarrow ? 10 : 14);
  const CHART_MARGIN = { top: 26, right: isNarrow ? 10 : 18, left: 0, bottom: 4 };

  // Looker Studio Custom Popover Tooltip
  const renderLookerTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const goal = data.dateStr ? dayGoal(data.dateStr) : 0;
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

            {data.totalQuestions >= goal ? (
              <div className="text-xs text-success-fg font-semibold flex items-center gap-1 pt-1 border-t border-line">
                <CheckCircle2 className="w-3 h-3 text-success-fg" />
                <span>
                  {goal > 0
                    ? `Günlük Hedefe Ulaşıldı (%${Math.round((data.totalQuestions / goal) * 100)})`
                    : 'Bu güne soru hedefi verilmedi'}
                </span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-xs text-brand-fg font-medium pt-1 border-t border-line">
                Hedefe {goal - data.totalQuestions} soru kaldı (günün hedefi {goal})
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
    currentStudent,
    classes,
    students,
    selectedClassId,
    setSelectedClassId,
    selectedStudentId,
    setSelectedStudentId,
    activeStudent,
    classStudents,
    activeTab,
    setActiveTabState,
    chartsReady,
    setActiveTab,
    chartVisualType,
    setChartVisualType,
    todayIso,
    isNarrow,
    shortDayLabels,
    weekOffset,
    setWeekOffset,
    monthDate,
    setMonthDate,
    isWeekModalOpen,
    setIsWeekModalOpen,
    isMonthModalOpen,
    setIsMonthModalOpen,
    weekSearchQuery,
    setWeekSearchQuery,
    monthSearchQuery,
    setMonthSearchQuery,
    inputMode,
    setInputMode,
    entryDate,
    setEntryDate,
    entryDateTouched,
    setEntryDateTouched,
    entryNotes,
    setEntryNotes,
    setSaveSuccessMsg,
    submitAttempted,
    setSubmitAttempted,
    formError,
    setFormError,
    isSaving,
    setIsSaving,
    successTimerRef,
    minEntryDate,
    dateError,
    activeSubjects,
    listRows,
    setListRows,
    singleSubject,
    setSingleSubject,
    singleCount,
    setSingleCount,
    singleCorrect,
    setSingleCorrect,
    singleWrong,
    setSingleWrong,
    singleTopic,
    setSingleTopic,
    singleEntries,
    setSingleEntries,
    singleError,
    setSingleError,
    setSingleInfo,
    allLogs,
    setAllLogs,
    sameDayLogs,
    existingLog,
    isEditMode,
    existingLogKey,
    existingContentSig,
    loadedRowsRef,
    loadedSigRef,
    loadedLogIdRef,
    savingRef,
    rowChecks,
    rowsWithErrors,
    listTotal,
    singleTotal,
    formTotal,
    entryDayTargets,
    subjectDayTarget,
    generalDayTarget,
    planTasks,
    setPlanTasks,
    sameSubject,
    planTaskText,
    planTasksFor,
    appendTopic,
    setPlanInfo,
    transferPlanTasks,
    teacherTopics,
    teacherTopicsSig,
    manualPlanTasks,
    teacherTopicsAppliedRef,
    autoTopicsRef,
    autoSingleRef,
    lastAutoCtxRef,
    nextWeekPlan,
    clearMessages,
    updateListRow,
    switchInputMode,
    handleAddSingleEntry,
    handleRemoveSingleEntry,
    handleSaveQuestionLog,
    handleEditHistoryLog,
    openTodayEntry,
    weekStartDay,
    targetWeekDate,
    weeklyAnalytics,
    monthlyAnalytics,
    studentHistoryLogs,
    pastWeeksList,
    filteredPastWeeks,
    pastMonthsList,
    filteredPastMonths,
    currentWeekListIdx,
    canGoPreviousWeek,
    canGoNextWeek,
    handlePreviousWeek,
    handleNextWeek,
    currentMonthListIdx,
    canGoPreviousMonth,
    canGoNextMonth,
    handlePreviousMonth,
    handleNextMonth,
    currentWeekStartDate,
    currentWeekEndDate,
    activeTargets,
    dailyQuestionTarget,
    weeklyTargetRows,
    mirrorTargets,
    generalTargetRes,
    subjectTargetRows,
    dayGoalRow,
    dayGoal,
    monthlyPlan,
    monthlyTargetTotal,
    monthlyTargetCompletionRate,
    chartDays,
    maxDayGoal,
    chartTopValue,
    yAxisWidth,
    CHART_MARGIN,
    renderLookerTooltip,
  };
}

export type SoruModuluBaglamDegeri = ReturnType<typeof useSoruModulu>;
export const SoruModuluBaglam = createContext<SoruModuluBaglamDegeri | null>(null);
export function useSoruModuluBaglam(): SoruModuluBaglamDegeri {
  const d = useContext(SoruModuluBaglam);
  if (!d) throw new Error('SoruModuluBaglam sağlayıcısı yok');
  return d;
}
