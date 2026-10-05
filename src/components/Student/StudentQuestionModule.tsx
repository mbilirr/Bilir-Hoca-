import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  HelpCircle,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Download,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CalendarDays,
  Sparkles,
  ListFilter,
  Layers,
  Award,
  Target,
  ArrowUpRight,
  Filter,
  User,
  Users,
  Search,
  ChevronDown,
  RotateCcw,
  X,
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
import { Student, ClassGroup, StudentQuestionLog, QuestionLogSubjectEntry, WeeklyQuestionTarget } from '../../types';
import { dataService } from '../../services/dataService';
import { StudentTargetCards } from './StudentTargetCards';
import {
  DEFAULT_SUBJECTS,
  computeWeeklyAnalytics,
  computeMonthlyAnalytics,
  downloadWeeklyPDF,
  downloadMonthlyPDF,
  formatTurkishDate,
  formatDateISO,
  getMondayOfWeek,
  TURKISH_MONTHS,
  getStudentSchoolLevel,
  getStudentQuestionSubjects,
} from '../../utils/questionAnalytics';

// =============================================================================
// Ortak yardımcılar (öğrenci ve öğretmen soru grafikleri aynı kuralları kullanır)
// =============================================================================

/** Genel hedef yoksa kullanılan günlük soru hedefi */
export const DEFAULT_DAILY_QUESTION_TARGET = 50;
/** Bir derste bir günde girilebilecek en büyük sayı */
export const MAX_QUESTION_COUNT = 1000;
/** Kaç gün öncesine kadar soru kaydı girilebilir */
export const QUESTION_ENTRY_MAX_PAST_DAYS = 60;

/** YYYY-MM-DD → yerel Date (geçersizse null) */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
  return d;
}

/** "28 Eyl" gibi kısa tarih */
export function shortTurkishDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${d.getDate()} ${(TURKISH_MONTHS[d.getMonth()] || '').slice(0, 3)}`;
}

/**
 * Grafikteki günlük hedef çizgisi: o haftaya denk gelen hedefler içinde DERS SEÇİLMEMİŞ (genel)
 * ilk hedefin günlük sayısı; genel hedef yoksa 50. Ders hedefi (ör. yalnızca Matematik) tüm derslerin
 * toplamıyla karşılaştırılamayacağı için çizgide kullanılmaz.
 */
export function generalDailyTarget(targets: WeeklyQuestionTarget[]): number {
  const general = targets.find((t) => !t.subject);
  return Math.max(1, Number(general?.dailyTarget) || DEFAULT_DAILY_QUESTION_TARGET);
}

export interface MonthlyTargetPlan {
  total: number;
  days: number;
  perDay: Record<string, number>;
  hasGeneralTarget: boolean;
}

/**
 * Aylık hedef: ayın her günü için, o günün haftasına (Pzt–Paz) denk gelen genel hedefin günlük sayısı
 * (yoksa 50) toplanır. Tek bir genel hedef bütün ayı kapsıyorsa sonuç = günlük × ayın gün sayısı.
 */
export function computeMonthlyTargetPlan(studentId: string, year: number, month: number): MonthlyTargetPlan {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = formatDateISO(new Date(year, month, 1));
  const monthEnd = formatDateISO(new Date(year, month, daysInMonth));
  const monthTargets = studentId ? dataService.getQuestionTargetsForStudent(studentId, monthStart, monthEnd) : [];
  const hasGeneralTarget = monthTargets.some((t) => !t.subject);
  const perDay: Record<string, number> = {};
  const weekCache = new Map<string, number>();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    let daily = DEFAULT_DAILY_QUESTION_TARGET;
    if (hasGeneralTarget) {
      const mon = getMondayOfWeek(d);
      const monStr = formatDateISO(mon);
      if (!weekCache.has(monStr)) {
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        weekCache.set(monStr, generalDailyTarget(dataService.getQuestionTargetsForStudent(studentId, monStr, formatDateISO(sun))));
      }
      daily = weekCache.get(monStr) as number;
    }
    perDay[formatDateISO(d)] = daily;
    total += daily;
  }
  return { total, days: daysInMonth, perDay, hasGeneralTarget };
}

/** Bir tarih aralığının (ayın içindeki) hedef toplamı */
export function sumPlanRange(plan: MonthlyTargetPlan, startIso: string, endIso: string): number {
  let sum = 0;
  for (const [iso, v] of Object.entries(plan.perDay)) {
    if (iso >= startIso && iso <= endIso) sum += v;
  }
  return sum;
}

/** Yerel "bugün" (YYYY-MM-DD); pencere odaklanınca / görünür olunca ve her dakika yenilenir */
export function useTodayIso(): string {
  const [today, setToday] = useState<string>(() => formatDateISO(new Date()));
  useEffect(() => {
    const refresh = () => setToday(formatDateISO(new Date()));
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return today;
}

/** Dar ekran (telefon) mu? */
export function useIsNarrowScreen(maxWidth = 639): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return narrow;
}

/** Hedef çizgisinin etiketi: çizginin solunda, arka planlı (sütunların üstüne binse de okunur) */
export const TargetLineLabel: React.FC<{ viewBox?: { x?: number; y?: number }; text: string }> = ({ viewBox, text }) => {
  if (!viewBox) return null;
  const x = (viewBox.x ?? 0) + 4;
  const y = (viewBox.y ?? 0) - 20;
  const width = Math.round(text.length * 6.3 + 12);
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={17} rx={5} fill="var(--color-surface)" stroke="#ea580c" strokeWidth={1} opacity={0.95} />
      <text x={x + 6} y={y + 12.5} fill="#ea580c" fontSize={11} fontWeight={700}>
        {text}
      </text>
    </g>
  );
};

/** Grafiklerde imleç arka planı (koyu temada parlak gri blok yerine tema rengi) */
export const CHART_BAR_CURSOR = { fill: 'var(--color-surface-3)', opacity: 0.55 };
export const CHART_LINE_CURSOR = { stroke: 'var(--color-line-strong)', strokeWidth: 1.5 };

/** Grafik renkleri */
export const CHART_COLORS = {
  met: 'var(--chart-1)',
  below: '#3b82f6',
  zero: '#f43f5e',
  target: '#ea580c',
};

/** Haftalık grafiğin açıklaması (iki ekranda aynı) */
export const WeeklyChartLegend: React.FC<{ dailyTarget: number; mode: 'bar' | 'area' }> = ({ dailyTarget, mode }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold text-muted" data-testid="weekly-chart-legend">
    {mode === 'bar' ? (
      <>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded inline-block" style={{ background: CHART_COLORS.met }} /> Hedefe ulaştı
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded inline-block" style={{ background: CHART_COLORS.below }} /> Hedefin altında
        </span>
        <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-300">
          <span className="w-3 h-3 rounded inline-block" style={{ background: CHART_COLORS.zero }} /> 0 Soru
        </span>
      </>
    ) : (
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded inline-block" style={{ background: CHART_COLORS.met }} /> Çözülen Soru
      </span>
    )}
    <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-300">
      <span className="w-4 border-t-2 border-dashed border-orange-500 inline-block" /> Günlük hedef ({dailyTarget})
    </span>
  </div>
);

/** Aylık grafikteki hafta dilimi için ipucu kutusu (hafta toplamı, o dilimin hedefiyle karşılaştırılır) */
export const MonthlyBucketTooltip: React.FC<{ active?: boolean; payload?: any[]; plan: MonthlyTargetPlan }> = ({ active, payload, plan }) => {
  if (!active || !payload || !payload.length) return null;
  const w = payload[0].payload as {
    weekLabel: string;
    startDateStr: string;
    endDateStr: string;
    totalQuestions: number;
    totalCorrect: number;
    totalWrong: number;
    activeDaysCount: number;
    topSubject: string;
  };
  const start = parseIsoDate(w.startDateStr);
  const end = parseIsoDate(w.endDateStr);
  const dayCount = start && end ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : 7;
  const bucketTarget = sumPlanRange(plan, w.startDateStr, w.endDateStr);
  const pct = bucketTarget > 0 ? Math.round((w.totalQuestions / bucketTarget) * 100) : 0;
  return (
    <div className="bg-surface border border-line shadow-xl rounded-xl p-3.5 text-xs text-fg space-y-1.5 z-50 min-w-[210px]" data-testid="monthly-tooltip">
      <div className="font-bold text-fg border-b border-line pb-1.5">{w.weekLabel}</div>
      <div className="flex justify-between text-muted">
        <span>Toplam çözülen:</span>
        <strong className="text-fg">{w.totalQuestions} soru</strong>
      </div>
      <div className="flex justify-between text-muted">
        <span>Soru girilen gün:</span>
        <strong className="text-fg">
          {w.activeDaysCount} / {dayCount}
        </strong>
      </div>
      {w.totalCorrect > 0 || w.totalWrong > 0 ? (
        <div className="flex justify-between text-muted">
          <span>Doğru / Yanlış:</span>
          <span>
            <strong className="text-emerald-700 dark:text-emerald-300">{w.totalCorrect}</strong> /{' '}
            <strong className="text-rose-700 dark:text-rose-300">{w.totalWrong}</strong>
          </span>
        </div>
      ) : null}
      {w.topSubject && w.topSubject !== '—' && (
        <div className="flex justify-between text-muted">
          <span>En çok çalışılan:</span>
          <strong className="text-fg">{w.topSubject}</strong>
        </div>
      )}
      <div className="pt-1 border-t border-line text-[11px] text-muted">
        Bu {dayCount} günün hedefi: <strong className="text-fg">{bucketTarget} soru</strong> (%{pct})
      </div>
    </div>
  );
};

// =============================================================================
// Soru giriş formu yardımcıları
// =============================================================================

type EntryRow = { subject: string; questionCount: string; correctCount: string; wrongCount: string; topic: string };

const emptyEntryRow = (subject: string): EntryRow => ({
  subject,
  questionCount: '',
  correctCount: '',
  wrongCount: '',
  topic: '',
});

const rowHasContent = (r: EntryRow) =>
  !!(r.questionCount.trim() || r.correctCount.trim() || r.wrongCount.trim() || r.topic.trim());

/** Sayı alanı: boş → null; yalnızca rakam, 0..1000 */
function parseCountField(raw: string, label: string): { value: number | null; error?: string } {
  const t = (raw ?? '').trim();
  if (t === '') return { value: null };
  if (!/^\d+$/.test(t)) return { value: null, error: `${label}: yalnızca tam sayı girebilirsin.` };
  const n = parseInt(t, 10);
  if (n > MAX_QUESTION_COUNT) return { value: null, error: `${label}: en fazla ${MAX_QUESTION_COUNT} olabilir.` };
  return { value: n };
}

interface EntryRowCheck {
  count: number | null;
  correct: number | null;
  wrong: number | null;
  empty: number | null;
  errors: string[];
  invalid: { count: boolean; correct: boolean; wrong: boolean };
}

function checkEntryRow(r: EntryRow): EntryRowCheck {
  const q = parseCountField(r.questionCount, 'Soru');
  const c = parseCountField(r.correctCount, 'Doğru');
  const w = parseCountField(r.wrongCount, 'Yanlış');
  const errors: string[] = [];
  const invalid = { count: !!q.error, correct: !!c.error, wrong: !!w.error };
  [q, c, w].forEach((x) => x.error && errors.push(x.error));
  const cv = c.value || 0;
  const wv = w.value || 0;
  if (!q.error && !c.error && !w.error) {
    if ((q.value === null || q.value === 0) && cv + wv > 0) {
      errors.push('Doğru/yanlış girdiysen soru sayısını da girmelisin.');
      invalid.count = true;
    } else if (q.value !== null && cv + wv > q.value) {
      errors.push(`Doğru + yanlış (${cv + wv}) soru sayısından (${q.value}) fazla olamaz.`);
      invalid.correct = true;
      invalid.wrong = true;
    }
  }
  const empty = q.value !== null && errors.length === 0 ? Math.max(0, q.value - cv - wv) : null;
  return { count: q.value, correct: c.value, wrong: w.value, empty, errors, invalid };
}

/** Aynı dersten birden fazla satır varsa sayıları toplar, konuları birleştirir */
function mergeSubjectEntries(entries: QuestionLogSubjectEntry[]): QuestionLogSubjectEntry[] {
  const map = new Map<string, QuestionLogSubjectEntry>();
  for (const e of entries) {
    if (!e || !e.subject) continue;
    const cur = map.get(e.subject);
    if (!cur) {
      map.set(e.subject, { ...e, topic: e.topic?.trim() || undefined });
      continue;
    }
    cur.questionCount = (Number(cur.questionCount) || 0) + (Number(e.questionCount) || 0);
    if (cur.correctCount !== undefined || e.correctCount !== undefined) {
      cur.correctCount = (Number(cur.correctCount) || 0) + (Number(e.correctCount) || 0);
    }
    if (cur.wrongCount !== undefined || e.wrongCount !== undefined) {
      cur.wrongCount = (Number(cur.wrongCount) || 0) + (Number(e.wrongCount) || 0);
    }
    cur.emptyCount = undefined;
    const t = e.topic?.trim();
    if (t) {
      const topics = (cur.topic || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!topics.includes(t)) cur.topic = [...topics, t].join(', ');
    }
  }
  return Array.from(map.values());
}

/** Kayıttaki dersleri form satırlarına çevirir (ders listesi + listede olmayan dersler) */
function buildEntryRows(subjects: string[], entries: QuestionLogSubjectEntry[]): EntryRow[] {
  const toRow = (subject: string, e?: QuestionLogSubjectEntry): EntryRow =>
    e
      ? {
          subject,
          questionCount: e.questionCount ? String(e.questionCount) : '',
          correctCount: e.correctCount ? String(e.correctCount) : '',
          wrongCount: e.wrongCount ? String(e.wrongCount) : '',
          topic: e.topic || '',
        }
      : emptyEntryRow(subject);
  const rows = subjects.map((s) => toRow(s, entries.find((e) => e.subject === s)));
  entries.filter((e) => !subjects.includes(e.subject)).forEach((e) => rows.push(toRow(e.subject, e)));
  return rows;
}

/** Sayı kutularında rakam dışındaki tuşlar (e, +, -, virgül, nokta) engellenir */
const blockNonDigitKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
};

/** Yapıştırılan metinden yalnızca rakamlar alınır */
const pasteDigitsOnly = (setter: (v: string) => void) => (e: React.ClipboardEvent<HTMLInputElement>) => {
  e.preventDefault();
  const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
  setter(digits);
};

interface StudentQuestionModuleProps {
  currentStudent: Student;
  classes: ClassGroup[];
  students: Student[];
}

export const StudentQuestionModule: React.FC<StudentQuestionModuleProps> = ({
  currentStudent,
  classes,
  students,
}) => {
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
  const [activeTab, setActiveTab] = useState<'entry' | 'weekly' | 'monthly' | 'history'>('weekly');

  // Grafik görselleştirme tipi: 'bar' (Sütun) | 'area' (Trend & Alan)
  const [chartVisualType, setChartVisualType] = useState<'bar' | 'area'>('bar');

  // Yerel "bugün" (gece yarısından sonra kendiliğinden yenilenir)
  const todayIso = useTodayIso();
  const isNarrow = useIsNarrowScreen();

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

  // Esc ile hafta / ay seçim pencerelerini kapatma
  useEffect(() => {
    if (!isWeekModalOpen && !isMonthModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWeekModalOpen(false);
        setIsMonthModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWeekModalOpen, isMonthModalOpen]);

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
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');
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
  const [singleInfo, setSingleInfo] = useState<string>('');

  // Soru logları aboneliği
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
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
    } else if (loadedLogIdRef.current) {
      setListRows(activeSubjects.map((s) => emptyEntryRow(s)));
      setSingleEntries([]);
      setEntryNotes('');
      loadedLogIdRef.current = null;
    }
    setSubmitAttempted(false);
    setFormError('');
    setSingleError('');
    setSingleInfo('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStudent.id, entryDate, existingLogKey]);

  // Satır doğrulaması (her değişiklikte)
  const rowChecks = useMemo(() => listRows.map((r) => checkEntryRow(r)), [listRows]);
  const rowsWithErrors = useMemo(
    () => listRows.filter((_, i) => rowChecks[i].errors.length > 0).map((r) => r.subject),
    [listRows, rowChecks]
  );
  const listTotal = useMemo(() => rowChecks.reduce((s, c) => s + (c.count || 0), 0), [rowChecks]);
  const singleTotal = useMemo(() => singleEntries.reduce((s, e) => s + (e.questionCount || 0), 0), [singleEntries]);
  const formTotal = inputMode === 'list' ? listTotal : singleTotal;

  const clearMessages = () => {
    setFormError('');
    if (saveSuccessMsg) setSaveSuccessMsg('');
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
    successTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(''), 7000);
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
      targetWeekDate
    );
  }, [allLogs, activeStudent, targetWeekDate]);

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
    const currentMonday = getMondayOfWeek(new Date());
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent.id);

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
  }, [allLogs, activeStudent.id, todayIso]);

  // Filtrelenmiş geçmiş haftalar (Arama için)
  const filteredPastWeeks = useMemo(() => {
    return pastWeeksList.filter((item) => {
      if (weekSearchQuery.trim()) {
        const q = weekSearchQuery.toLowerCase().trim();
        const matchesLabel = item.weekLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
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
        const q = monthSearchQuery.toLowerCase().trim();
        const matchesLabel = item.monthLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
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
    const mon = getMondayOfWeek(targetWeekDate);
    return formatDateISO(mon);
  }, [targetWeekDate]);

  const currentWeekEndDate = useMemo(() => {
    const mon = getMondayOfWeek(targetWeekDate);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return formatDateISO(sun);
  }, [targetWeekDate]);

  const activeTargets = useMemo(() => {
    return dataService.getQuestionTargetsForStudent(activeStudent.id, currentWeekStartDate, currentWeekEndDate);
  }, [activeStudent.id, currentWeekStartDate, currentWeekEndDate, allLogs]);
  // Günlük hedef çizgisi: bu haftanın GENEL (ders seçilmemiş) hedefinin günlük sayısı, yoksa 50.
  // Öğretmen ekranı da aynı kuralı kullanır (generalDailyTarget).
  const dailyQuestionTarget = generalDailyTarget(activeTargets);

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

  // Looker Studio Custom Popover Tooltip
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
      {/* ========================================================================= */}
      {/* GOOGLE LOOKER STUDIO - EXECUTIVE CONTROL BAR & APP HEADER               */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-fg text-surface flex items-center justify-center shadow-md shadow-slate-900/10">
              <BarChart3 className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg tracking-tight">
                Günlük Soru Çözümü ve Başarı İlerleme Modülü
              </h2>
            </div>
          </div>

          {/* Quick PDF & Export Bar */}
          <div className="flex items-center gap-2">
            {activeTab === 'weekly' && weeklyAnalytics && (
              <button
                id="btn-student-looker-pdf-weekly"
                onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Haftalık Raporu İndir (PDF)</span>
              </button>
            )}
            {activeTab === 'monthly' && monthlyAnalytics && (
              <button
                id="btn-student-looker-pdf-monthly"
                onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent, { logs: allLogs, getTargets: (a, b) => dataService.getQuestionTargetsForStudent(activeStudent.id, a, b) })}
                className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Aylık Raporu İndir (PDF)</span>
              </button>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Tab Navigation */}
        <div className="pt-4">
          {/* Görünüm Modu / Sekme Seçimi */}
          <div className="bg-surface-2 p-3 rounded-xl border border-line w-full">
            <label className="block text-[11px] font-bold text-fg-2 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#1e3a8a] dark:text-blue-200" />
              Çalışma Modülü & Analiz Boyutu
            </label>
            <div className="flex rounded-lg bg-surface border border-line-strong p-0.5">
              <button
                type="button"
                id="btn-student-tab-entry"
                onClick={() => setActiveTab('entry')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'entry'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-muted hover:text-orange-600 dark:hover:text-orange-300'
                }`}
              >
                + Soru Kaydet
              </button>
              <button
                type="button"
                id="btn-student-tab-history"
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Geçmiş Kayıtlar
              </button>
              <button
                type="button"
                id="btn-student-tab-weekly"
                onClick={() => setActiveTab('weekly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'weekly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Haftalık Analiz
              </button>
              <button
                type="button"
                id="btn-student-tab-monthly"
                onClick={() => setActiveTab('monthly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'monthly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Aylık Analiz
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEKME 1: HAFTALIK LOOKER STUDIO DASHBOARD                                */}
      {/* ========================================================================= */}
      {activeTab === 'weekly' && weeklyAnalytics && (
        <div className="space-y-6">
          {/* Hafta Gezinme */}
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousWeek}
                disabled={!canGoPreviousWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousWeek
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousWeek ? 'Önceki Soru Çözülen Hafta' : 'Daha Eski Kayıtlı Hafta Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-week-picker"
                type="button"
                onClick={() => setIsWeekModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-surface-2 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 border border-line-strong hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left"
                title="Geçmiş haftaları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100/80 dark:bg-orange-500/15 group-hover:bg-orange-600 text-orange-600 dark:text-orange-300 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-300 uppercase tracking-wider block">
                      {weekOffset === 0 ? 'Güncel Hafta' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
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
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1">
                    <span className="text-muted font-medium">Haftalık İnceleme:</span>
                    <span className="text-[#1e3a8a] dark:text-blue-200 underline decoration-orange-400/60 decoration-2 underline-offset-2">
                      {weeklyAnalytics.weekLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-line text-subtle group-hover:text-orange-600 dark:group-hover:text-orange-300 flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 dark:text-orange-300" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextWeek}
                disabled={!canGoNextWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextWeek
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoNextWeek ? 'Sonraki Soru Çözülen Hafta' : 'Daha Yeni Hafta Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Güncel Haftaya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Hafta</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openTodayEntry}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bugünün Sorularını Ekle</span>
              </button>
            </div>
          </div>

          {/* Öğretmenlerin verdiği soru hedefleri */}
          <StudentTargetCards targets={activeTargets} studentId={activeStudent.id} logs={allLogs} />

          {/* Ana Grafik */}
          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm" id="student-weekly-chart">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div>
                <h4 className="text-base font-bold text-fg tracking-tight">
                  Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <WeeklyChartLegend dailyTarget={dailyQuestionTarget} mode={chartVisualType} />

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
                    Sütun
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
                    Trend
                  </button>
                </div>
              </div>
            </div>

            <div className="h-72 sm:h-80 w-full bg-surface-2 rounded-xl p-2 sm:p-3 border border-line">
              <ResponsiveContainer width="100%" height="100%">
                {chartVisualType === 'bar' ? (
                  <BarChart
                    data={weeklyAnalytics.days}
                    margin={{ top: 28, right: isNarrow ? 4 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}
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
                    <ReferenceLine
                      y={dailyQuestionTarget}
                      stroke={CHART_COLORS.target}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={<TargetLineLabel text={`Hedef: ${dailyQuestionTarget} Soru`} />}
                    />
                    <Bar dataKey="totalQuestions" radius={[6, 6, 0, 0]} maxBarSize={55} minPointSize={4}>
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
                        const isZero = entry.totalQuestions === 0;
                        const isAboveTarget = entry.totalQuestions >= dailyQuestionTarget;
                        return (
                          <Cell
                            key={`cell-student-${index}`}
                            fill={isZero ? CHART_COLORS.zero : isAboveTarget ? CHART_COLORS.met : CHART_COLORS.below}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                ) : (
                  <AreaChart
                    data={weeklyAnalytics.days}
                    margin={{ top: 28, right: isNarrow ? 8 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="studentNavyGradient" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#studentNavyGradient)"
                      dot={{ r: 5, fill: '#ea580c', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                    >
                      <LabelList
                        dataKey="totalQuestions"
                        position="top"
                        fill="var(--color-fg)"
                        fontSize={isNarrow ? 10 : 12}
                        fontWeight={800}
                        offset={8}
                      />
                    </Area>
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Günlük Veri Tablosu ve Ders Dağılımı */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-sm">
              <h4 className="text-sm font-bold text-fg mb-4 pb-2 border-b border-line">
                Günlük Soru Çözüm ve Başarı Tablosu
              </h4>
              <p className="sm:hidden mb-2 text-[11px] text-muted" data-testid="table-scroll-hint">Tabloyu yana kaydırabilirsin →</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                    <tr>
                      <th className="px-3.5 py-2.5">Gün</th>
                      <th className="px-3.5 py-2.5">Tarih</th>
                      <th className="px-3.5 py-2.5 text-center">Çözülen Soru</th>
                      <th className="px-3.5 py-2.5">Ders Dağılımı</th>
                      <th className="px-3.5 py-2.5 text-center">Hedef Durumu</th>
                      <th className="px-3.5 py-2.5 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {weeklyAnalytics.days.map((d) => {
                      const metTarget = d.totalQuestions >= dailyQuestionTarget;
                      const completionRate = Math.min(100, Math.round((d.totalQuestions / dailyQuestionTarget) * 100));
                      return (
                        <tr key={d.dateStr} className="hover:bg-surface-2 transition-colors">
                          <td className="px-3.5 py-2.5 font-bold text-fg">{d.dayName}</td>
                          <td className="px-3.5 py-2.5 text-muted whitespace-nowrap">{shortTurkishDate(d.dateStr)}</td>
                          <td className="px-3.5 py-2.5 text-center">
                            <span className="font-extrabold text-fg text-sm">{d.totalQuestions}</span>
                          </td>
                          <td className="px-3.5 py-2.5 text-muted min-w-[140px] max-w-[260px] whitespace-normal">
                            {d.subjectsText || <span className="text-subtle italic">Ders kaydı yok</span>}
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
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
                          <td className="px-3.5 py-2.5 text-center">
                            {d.hasSolved ? (
                              metTarget ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                  Hedef Tamamlandı
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                                  Kısmi Çözüm
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                                0 Soru ⚠️
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                  Derslere Göre Soru Dağılımı
                </h4>
                {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {weeklyAnalytics.subjectBreakdown.map((sub, i) => (
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
                  <p className="text-xs text-muted italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                )}

                <div className="mt-5 p-3.5 bg-surface-2 rounded-xl border border-line text-xs text-fg-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Award className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                    <span>Haftalık Rehberlik Tavsiyesi</span>
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
                  <span>Haftalık Raporumu İndir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEKME 2: AYLIK LOOKER STUDIO DASHBOARD                                   */}
      {/* ========================================================================= */}
      {activeTab === 'monthly' && monthlyAnalytics && (
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousMonth}
                disabled={!canGoPreviousMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousMonth
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousMonth ? 'Önceki Soru Çözülen Ay' : 'Daha Eski Kayıtlı Ay Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-month-picker"
                type="button"
                onClick={() => setIsMonthModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-surface-2 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 border border-line-strong hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left"
                title="Geçmiş ayları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100/80 dark:bg-orange-500/15 group-hover:bg-orange-600 text-orange-600 dark:text-orange-300 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-300 uppercase tracking-wider block">
                      {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                        ? 'Güncel Ay'
                        : 'Geçmiş Dönem'}
                    </span>
                    {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                      <span className="text-[9px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-1.5 py-0.2 rounded-md">
                        Aktif Ay
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                        Geçmiş Ay
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1">
                    <span className="text-muted font-medium">Analiz Ayı:</span>
                    <span className="text-[#1e3a8a] dark:text-blue-200 underline decoration-orange-400/60 decoration-2 underline-offset-2">
                      {monthlyAnalytics.monthLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-line text-subtle group-hover:text-orange-600 dark:group-hover:text-orange-300 flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 dark:text-orange-300" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={!canGoNextMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextMonth
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoNextMonth ? 'Sonraki Soru Çözülen Ay' : 'Daha Yeni Ay Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                  }}
                  className="px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Güncel Aya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Ay</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aylık Toplam Soru</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-fg">{monthlyAnalytics.totalQuestions}</span>
                <span className="text-xs font-semibold text-muted">Soru</span>
              </div>
              <div className="mt-3 text-[11px] text-muted">
                Haftalık Ortalama: <strong className="text-fg">{monthlyAnalytics.weeklyAverage} soru</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aylık Hedef Bitirme</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-orange-600 dark:text-orange-300">%{monthlyTargetCompletionRate}</span>
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
                  {monthlyPlan.hasGeneralTarget ? 'Genel hedeflerin günlük sayısı × ayın günleri' : `Genel hedef yok: günde ${DEFAULT_DAILY_QUESTION_TARGET} × ${monthlyPlan.days} gün`}
                </span>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aktif Çalışma Günleri</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-fg">{monthlyAnalytics.activeDaysCount}</span>
                <span className="text-xs font-semibold text-muted">Gün</span>
              </div>
              <div className="mt-3 text-[11px] text-muted">
                Aylık Düzenlilik: <strong className="text-fg">%{Math.round((monthlyAnalytics.activeDaysCount / monthlyPlan.days) * 100)}</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Geçmiş Aya Göre Gelişim</span>
              <div className="flex items-baseline gap-2 mt-2">
                {monthlyAnalytics.monthlyDifference >= 0 ? (
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">+{monthlyAnalytics.monthlyDifference} Soru</span>
                ) : (
                  <span className="text-2xl font-black text-rose-700 dark:text-rose-300">{monthlyAnalytics.monthlyDifference} Soru</span>
                )}
              </div>
              <div className="mt-3 text-[11px] text-muted">
                Önceki Ay: <strong className="text-fg">{monthlyAnalytics.previousMonthTotal} soru</strong>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm" id="student-monthly-chart">
            <h4 className="text-base font-bold text-fg tracking-tight mb-4">
              Aylık Hafta Bazında Soru Çözüm Grafiği
            </h4>
            <div className="h-72 sm:h-80 w-full bg-surface-2 rounded-xl p-2 sm:p-3 border border-line">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAnalytics.weeks} margin={{ top: 25, right: isNarrow ? 4 : 15, left: isNarrow ? -22 : -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    interval={0}
                    tickFormatter={(v: string) => (isNarrow ? String(v).replace(/\s*\(.*\)$/, '').replace('Hafta', 'Hf.') : String(v))}
                    stroke="var(--color-muted)"
                    fontSize={isNarrow ? 10 : 11}
                    fontWeight={600}
                    tickLine={false}
                  />
                  <YAxis stroke="var(--color-muted)" fontSize={isNarrow ? 10 : 12} fontWeight={600} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<MonthlyBucketTooltip plan={monthlyPlan} />} cursor={CHART_BAR_CURSOR} />
                  <Bar dataKey="totalQuestions" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    <LabelList dataKey="totalQuestions" position="top" fill="var(--color-fg)" fontSize={isNarrow ? 10 : 12} fontWeight={800} offset={8} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEKME 3: YENİ SORU SAYISI KAYDET FORMU                                    */}
      {/* ========================================================================= */}
      {activeTab === 'entry' && (
        <div id="question-entry-form" className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-fg">
                {isEditMode ? 'Günlük Soru Kaydını Düzenle' : 'Günlük Soru Sayısı Girişi'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-surface-2 p-0.5 border border-line text-xs">
                <button
                  type="button"
                  id="qe-mode-list"
                  onClick={() => switchInputMode('list')}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'list'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  Ders Listesi Tablosu
                </button>
                <button
                  type="button"
                  id="qe-mode-single"
                  onClick={() => switchInputMode('single')}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'single'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  Tek Tek Ders Ekle
                </button>
              </div>
            </div>
          </div>

          {saveSuccessMsg && (
            <div
              id="qe-success"
              role="status"
              className="p-3 bg-success-soft border border-emerald-200 dark:border-emerald-500/30 text-success-fg rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Tarih Seçimi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
              <label htmlFor="qe-date" className="block text-xs font-bold text-fg-2 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1e3a8a] dark:text-blue-200" />
                Soru Çözülen Tarih
              </label>
              <input
                id="qe-date"
                type="date"
                required
                min={minEntryDate}
                max={todayIso}
                value={entryDate}
                aria-invalid={!!dateError}
                onChange={(e) => {
                  setSaveSuccessMsg('');
                  setEntryDateTouched(true);
                  setEntryDate(e.target.value);
                }}
                className={`w-full bg-surface border rounded-lg px-3 py-1.5 text-xs font-bold text-fg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                  dateError ? 'border-rose-500' : 'border-line-strong'
                }`}
              />
              {dateError ? (
                <p id="qe-date-error" className="mt-1.5 text-[11px] font-semibold text-danger-fg">
                  {dateError}
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted">
                  Bugün veya son {QUESTION_ENTRY_MAX_PAST_DAYS} gün içinden bir tarih seçebilirsin.
                </p>
              )}
            </div>

            <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
              <label htmlFor="qe-notes" className="block text-xs font-bold text-fg-2 mb-1.5">
                Çalışma Notu veya Deneme Adı (İsteğe Bağlı)
              </label>
              <input
                id="qe-notes"
                type="text"
                maxLength={300}
                placeholder="Örn: Hafta sonu genel tarama testi"
                value={entryNotes}
                onChange={(e) => {
                  clearMessages();
                  setEntryNotes(e.target.value);
                }}
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-1.5 text-xs text-fg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          {isEditMode && !dateError && (
            <div
              id="qe-edit-notice"
              role="note"
              className="p-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-warning-soft text-warning-fg text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bu tarihte kaydın var; değişikliklerin bu kaydı günceller.</p>
                <p className="mt-0.5 opacity-90">
                  {formatTurkishDate(entryDate)} günü kaydettiğin dersler ({existingLog?.totalQuestions ?? 0} soru) forma yüklendi.
                  Sayıları değiştirebilir veya yeni ders ekleyebilirsin.
                </p>
              </div>
            </div>
          )}

          {/* Input Mode: Ders listesi (masaüstünde tablo, telefonda her ders bir kart) */}
          {inputMode === 'list' && (
            <div className="border border-line rounded-xl overflow-hidden" id="qe-list">
              <div className="hidden sm:grid grid-cols-[minmax(110px,1.3fr)_repeat(4,minmax(60px,0.6fr))_minmax(130px,2fr)] gap-3 px-3.5 py-2.5 bg-surface-2 text-fg-2 font-bold text-xs border-b border-line">
                <span>Ders Adı</span>
                <span className="text-center">Çözülen Soru</span>
                <span className="text-center">Doğru</span>
                <span className="text-center">Yanlış</span>
                <span className="text-center">Boş</span>
                <span>Çalışılan Konu / Test</span>
              </div>
              <div className="divide-y divide-line">
                {listRows.map((row, idx) => {
                  const check = rowChecks[idx];
                  const hasError = check.errors.length > 0;
                  const inputBase =
                    'w-full bg-surface border rounded-lg px-2 py-1.5 sm:py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-orange-500/20';
                  return (
                    <div
                      key={row.subject}
                      data-testid="qe-row"
                      data-subject={row.subject}
                      className={`grid grid-cols-2 sm:grid-cols-[minmax(110px,1.3fr)_repeat(4,minmax(60px,0.6fr))_minmax(130px,2fr)] gap-x-3 gap-y-2 px-3.5 py-3 sm:py-2 items-center ${
                        hasError ? 'bg-danger-soft/40' : 'hover:bg-surface-2'
                      }`}
                    >
                      <div className="col-span-2 sm:col-span-1 font-bold text-fg text-xs">{row.subject}</div>
                      <label className="block">
                        <span className="sm:hidden block text-[11px] font-semibold text-muted mb-1">Soru</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={MAX_QUESTION_COUNT}
                          step="1"
                          placeholder="0"
                          aria-label={`${row.subject} çözülen soru`}
                          aria-invalid={check.invalid.count}
                          data-testid="qe-count"
                          value={row.questionCount}
                          onKeyDown={blockNonDigitKeys}
                          onPaste={pasteDigitsOnly((v) => updateListRow(idx, 'questionCount', v))}
                          onChange={(e) => updateListRow(idx, 'questionCount', e.target.value)}
                          className={`${inputBase} font-bold text-fg ${check.invalid.count ? 'border-rose-500' : 'border-line-strong focus:border-orange-500'}`}
                        />
                      </label>
                      <label className="block">
                        <span className="sm:hidden block text-[11px] font-semibold text-muted mb-1">Doğru</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={MAX_QUESTION_COUNT}
                          step="1"
                          placeholder="—"
                          aria-label={`${row.subject} doğru`}
                          aria-invalid={check.invalid.correct}
                          data-testid="qe-correct"
                          value={row.correctCount}
                          onKeyDown={blockNonDigitKeys}
                          onPaste={pasteDigitsOnly((v) => updateListRow(idx, 'correctCount', v))}
                          onChange={(e) => updateListRow(idx, 'correctCount', e.target.value)}
                          className={`${inputBase} text-emerald-700 dark:text-emerald-300 font-semibold ${check.invalid.correct ? 'border-rose-500' : 'border-line-strong focus:border-emerald-500'}`}
                        />
                      </label>
                      <label className="block">
                        <span className="sm:hidden block text-[11px] font-semibold text-muted mb-1">Yanlış</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max={MAX_QUESTION_COUNT}
                          step="1"
                          placeholder="—"
                          aria-label={`${row.subject} yanlış`}
                          aria-invalid={check.invalid.wrong}
                          data-testid="qe-wrong"
                          value={row.wrongCount}
                          onKeyDown={blockNonDigitKeys}
                          onPaste={pasteDigitsOnly((v) => updateListRow(idx, 'wrongCount', v))}
                          onChange={(e) => updateListRow(idx, 'wrongCount', e.target.value)}
                          className={`${inputBase} text-rose-700 dark:text-rose-300 font-semibold ${check.invalid.wrong ? 'border-rose-500' : 'border-line-strong focus:border-rose-500'}`}
                        />
                      </label>
                      <div>
                        <span className="sm:hidden block text-[11px] font-semibold text-muted mb-1">Boş (otomatik)</span>
                        <div
                          data-testid="qe-empty"
                          title="Boş = soru − doğru − yanlış"
                          className="w-full rounded-lg px-2 py-1.5 sm:py-1 text-xs text-center text-muted bg-surface-2 border border-dashed border-line"
                        >
                          {check.empty !== null && check.count ? check.empty : '—'}
                        </div>
                      </div>
                      <label className="block col-span-2 sm:col-span-1">
                        <span className="sm:hidden block text-[11px] font-semibold text-muted mb-1">Konu / Test</span>
                        <input
                          type="text"
                          maxLength={120}
                          placeholder="Konu adı..."
                          aria-label={`${row.subject} konu`}
                          data-testid="qe-topic"
                          value={row.topic}
                          onChange={(e) => updateListRow(idx, 'topic', e.target.value)}
                          className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 sm:py-1 text-xs text-fg focus:border-orange-500 focus:outline-none"
                        />
                      </label>
                      {hasError && (
                        <p
                          data-testid="qe-row-error"
                          role="alert"
                          className="col-span-2 sm:col-span-6 text-[11px] font-semibold text-danger-fg"
                        >
                          {check.errors.join(' ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Input Mode: Single Form */}
          {inputMode === 'single' && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddSingleEntry}
                noValidate
                className="grid grid-cols-2 sm:grid-cols-6 gap-3 bg-surface-2 p-4 rounded-xl border border-line"
              >
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="qe-single-subject" className="block text-[11px] font-bold text-fg-2 mb-1">Ders</label>
                  <select
                    id="qe-single-subject"
                    value={singleSubject}
                    onChange={(e) => setSingleSubject(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-fg"
                  >
                    {activeSubjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="qe-single-count" className="block text-[11px] font-bold text-fg-2 mb-1">Soru Sayısı</label>
                  <input
                    id="qe-single-count"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={MAX_QUESTION_COUNT}
                    step="1"
                    placeholder="Soru"
                    value={singleCount}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={pasteDigitsOnly(setSingleCount)}
                    onChange={(e) => {
                      setSingleError('');
                      setSingleCount(e.target.value);
                    }}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-fg"
                  />
                </div>

                <div>
                  <label htmlFor="qe-single-correct" className="block text-[11px] font-bold text-fg-2 mb-1">Doğru</label>
                  <input
                    id="qe-single-correct"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={MAX_QUESTION_COUNT}
                    step="1"
                    placeholder="D"
                    value={singleCorrect}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={pasteDigitsOnly(setSingleCorrect)}
                    onChange={(e) => {
                      setSingleError('');
                      setSingleCorrect(e.target.value);
                    }}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor="qe-single-wrong" className="block text-[11px] font-bold text-fg-2 mb-1">Yanlış</label>
                  <input
                    id="qe-single-wrong"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={MAX_QUESTION_COUNT}
                    step="1"
                    placeholder="Y"
                    value={singleWrong}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={pasteDigitsOnly(setSingleWrong)}
                    onChange={(e) => {
                      setSingleError('');
                      setSingleWrong(e.target.value);
                    }}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300 font-semibold"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="qe-single-topic" className="block text-[11px] font-bold text-fg-2 mb-1">Konu / Test</label>
                  <input
                    id="qe-single-topic"
                    type="text"
                    maxLength={120}
                    placeholder="Konu adı..."
                    value={singleTopic}
                    onChange={(e) => setSingleTopic(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-fg"
                  />
                </div>

                <div className="flex items-end col-span-2 sm:col-span-1">
                  <button
                    type="submit"
                    id="qe-single-add"
                    className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ekle
                  </button>
                </div>

                {singleError && (
                  <p id="qe-single-error" role="alert" className="col-span-2 sm:col-span-6 text-[11px] font-semibold text-danger-fg">
                    {singleError}
                  </p>
                )}
                {singleInfo && !singleError && (
                  <p id="qe-single-info" className="col-span-2 sm:col-span-6 text-[11px] font-semibold text-muted">
                    {singleInfo}
                  </p>
                )}
              </form>

              {singleEntries.length > 0 && (
                <div className="border border-line rounded-xl overflow-hidden divide-y divide-line" id="qe-single-list">
                  {singleEntries.map((item, idx) => {
                    const c = item.correctCount ?? 0;
                    const w = item.wrongCount ?? 0;
                    return (
                      <div key={`${item.subject}-${idx}`} data-testid="qe-single-row" className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs hover:bg-surface-2">
                        <div className="min-w-0">
                          <span className="font-bold text-fg">{item.subject}</span>
                          <span className="ml-2 font-bold text-fg">{item.questionCount} soru</span>
                          <span className="ml-2 text-muted">
                            D {c} · Y {w} · B {Math.max(0, item.questionCount - c - w)}
                          </span>
                          {item.topic && <span className="block text-[11px] text-muted truncate">Konu: {item.topic}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSingleEntry(idx)}
                          className="text-rose-600 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 text-xs font-semibold cursor-pointer"
                        >
                          Kaldır
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {submitAttempted && (dateError || formError || (inputMode === 'list' && rowsWithErrors.length > 0)) ? (
            <div
              id="qe-error-summary"
              role="alert"
              className="p-3 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-danger-soft text-danger-fg text-xs space-y-1"
            >
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> Kayıt yapılamadı, lütfen şunları düzelt:
              </p>
              <ul className="list-disc pl-6 space-y-0.5">
                {dateError && <li>{dateError}</li>}
                {inputMode === 'list' && rowsWithErrors.length > 0 && (
                  <li>Hatalı satırlar: {rowsWithErrors.join(', ')}</li>
                )}
                {formError && <li>{formError}</li>}
              </ul>
            </div>
          ) : formError ? (
            <div id="qe-error-summary" role="alert" className="p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-line">
            <span className="text-xs text-muted" id="qe-form-total">
              Formdaki toplam: <strong className="text-fg">{formTotal} soru</strong>
            </span>
            <button
              type="button"
              id="qe-save"
              onClick={handleSaveQuestionLog}
              disabled={isSaving}
              className="px-6 py-2.5 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <Check className="w-4 h-4 text-orange-400" />
              <span>{isSaving ? 'Kaydediliyor…' : isEditMode ? 'Kaydı Güncelle' : 'Soru Kaydını Tamamla ve Gönder'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEKME 4: GEÇMİŞ KAYITLAR                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm space-y-4" id="question-history">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-fg">Geçmiş Soru Sayısı Kayıtları</h3>
            </div>
            <span className="text-xs font-bold text-fg bg-surface-2 px-3 py-1.5 rounded-lg border border-line">
              Toplam {studentHistoryLogs.length} Günlük Kayıt
            </span>
          </div>

          {studentHistoryLogs.length === 0 ? (
            <div className="text-center py-10 text-subtle text-xs">
              Henüz geçmiş bir soru çözümü kaydı bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
              {studentHistoryLogs.map((log) => {
                const editable = log.date >= minEntryDate && log.date <= todayIso;
                return (
                  <div key={log.id} data-testid="qh-row" data-date={log.date} className="p-3.5 hover:bg-surface-2 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-baseline gap-3">
                        <span className="font-bold text-fg text-sm">{formatTurkishDate(log.date)}</span>
                        <span className="font-extrabold text-[#1e3a8a] dark:text-blue-200 text-sm" data-testid="qh-total">
                          {log.totalQuestions} Soru
                        </span>
                        <span className="text-[11px] text-muted" data-testid="qh-dyb">
                          D {log.totalCorrect || 0} · Y {log.totalWrong || 0} · B {log.totalEmpty || 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="qh-edit"
                          disabled={!editable}
                          onClick={() => handleEditHistoryLog(log)}
                          title={
                            editable
                              ? 'Bu günün kaydını düzenle'
                              : `${QUESTION_ENTRY_MAX_PAST_DAYS} günden eski kayıtlar düzenlenemez`
                          }
                          className="px-2.5 py-1 rounded-lg text-xs font-bold border border-line-strong text-fg-2 bg-surface hover:bg-surface-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          data-testid="qh-delete"
                          onClick={async () => {
                            if (window.confirm(`${formatTurkishDate(log.date)} tarihli soru kaydını silmek istediğine emin misin?`)) {
                              try {
                                await dataService.deleteQuestionLog(log.id);
                              } catch {
                                // hata uyarısı gösterildi, kayıt geri getirildi
                              }
                            }
                          }}
                          className="p-1.5 text-rose-600 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Kaydı Sil"
                          aria-label="Kaydı Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs" data-testid="qh-entries">
                      {log.entries.map((e, i) => {
                        const c = Number(e.correctCount) || 0;
                        const w = Number(e.wrongCount) || 0;
                        const emp = e.emptyCount !== undefined ? Number(e.emptyCount) || 0 : Math.max(0, e.questionCount - c - w);
                        return (
                          <li key={`${e.subject}-${i}`} className="min-w-0">
                            <span className="font-semibold text-fg">{e.subject}:</span>{' '}
                            <span className="font-bold text-fg">{e.questionCount}</span>{' '}
                            <span className="text-muted">
                              (D {c} · Y {w} · B {emp})
                            </span>
                            {e.topic && <span className="text-muted"> — {e.topic}</span>}
                          </li>
                        );
                      })}
                    </ul>
                    {log.notes && <p className="mt-1.5 text-[11px] text-muted italic">Not: {log.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: GEÇMİŞ HAFTALAR AÇILIR PENCERESİ (YALNIZCA SORU ÇÖZÜLENLER)       */}
      {/* ========================================================================= */}
      {isWeekModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-line flex items-center justify-between bg-gradient-to-r from-orange-50/70 dark:from-orange-500/10 via-surface to-surface-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-fg">
                    Haftalık İnceleme Dönemi Seçin
                  </h3>
                  <p className="text-xs text-muted font-medium">
                    Yalnızca soru çözümü yapılan kayıtlı haftalar listelenmektedir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWeekModalOpen(false)}
                className="p-2 text-subtle hover:text-muted hover:bg-surface-2 rounded-xl transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Barı */}
            <div className="p-4 border-b border-line bg-surface-2">
              <div className="relative">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={weekSearchQuery}
                  onChange={(e) => setWeekSearchQuery(e.target.value)}
                  placeholder="Tarih veya hafta ara..."
                  className="w-full pl-9 pr-8 py-2 bg-surface border border-line-strong rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                {weekSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setWeekSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Hafta Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
                  Aramanıza uygun kayıtlı hafta bulunamadı.
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
                              ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {item.offset === 0 ? 'Bugün' : `${item.offset}H`}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-fg">
                              {item.relativeLabel}
                            </span>
                            {item.offset === 0 && (
                              <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                                Güncel
                              </span>
                            )}
                            {item.hasActivity && (
                              <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                                {item.activeDaysCount} Gün Çözüm
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted mt-0.5 font-medium">
                            {item.weekLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-line sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-black text-[#1e3a8a] dark:text-blue-200 block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-[10px] text-muted block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-surface-2 hover:bg-orange-500 hover:text-white text-fg-2'
                          }`}
                        >
                          {isSelected ? 'Seçili' : 'İncele'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-line bg-surface-2 flex justify-between items-center text-xs text-muted px-5">
              <span>Toplam {pastWeeksList.length} kayıtlı dönem</span>
              <button
                type="button"
                onClick={() => setIsWeekModalOpen(false)}
                className="px-4 py-1.5 bg-surface-3 hover:bg-surface-3 text-fg-2 rounded-xl font-bold transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: GEÇMİŞ AYLAR AÇILIR PENCERESİ (YALNIZCA SORU ÇÖZÜLENLER)          */}
      {/* ========================================================================= */}
      {isMonthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-line flex items-center justify-between bg-gradient-to-r from-orange-50/70 dark:from-orange-500/10 via-surface to-surface-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-fg">
                    Aylık Analiz Dönemi Seçin
                  </h3>
                  <p className="text-xs text-muted font-medium">
                    Yalnızca soru çözümü yapılan kayıtlı aylar listelenmektedir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="p-2 text-subtle hover:text-muted hover:bg-surface-2 rounded-xl transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Barı */}
            <div className="p-4 border-b border-line bg-surface-2">
              <div className="relative">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={monthSearchQuery}
                  onChange={(e) => setMonthSearchQuery(e.target.value)}
                  placeholder="Ay veya yıl ara..."
                  className="w-full pl-9 pr-8 py-2 bg-surface border border-line-strong rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                {monthSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMonthSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Ay Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastMonths.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
                  Aramanıza uygun kayıtlı ay bulunamadı.
                </div>
              ) : (
                filteredPastMonths.map((item) => {
                  const isSelected = item.year === monthDate.year && item.month === monthDate.month;
                  const isCurrent =
                    item.year === new Date().getFullYear() && item.month === new Date().getMonth();
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
                              ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-fg">
                              {item.monthLabel}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                                Güncel Ay
                              </span>
                            )}
                            <span className="text-[9px] font-semibold text-muted bg-surface-2 px-1.5 py-0.2 rounded-md">
                              {item.relativeLabel}
                            </span>
                          </div>
                          {item.hasActivity && (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-0.5">
                              {item.activeDaysCount} Gün Çözüm Kaydı
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-line sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-black text-[#1e3a8a] dark:text-blue-200 block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-[10px] text-muted block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-surface-2 hover:bg-orange-500 hover:text-white text-fg-2'
                          }`}
                        >
                          {isSelected ? 'Seçili' : 'İncele'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-line bg-surface-2 flex justify-between items-center text-xs text-muted px-5">
              <span>Toplam {pastMonthsList.length} kayıtlı ay</span>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="px-4 py-1.5 bg-surface-3 hover:bg-surface-3 text-fg-2 rounded-xl font-bold transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
