import React, { useState, useMemo, useEffect, useRef, startTransition } from 'react';
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
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  ComposedChart,
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
  getWeekStartOf,
  TURKISH_MONTHS,
  getStudentSchoolLevel,
  getStudentQuestionSubjects,
} from '../../utils/questionAnalytics';
import {
  computeTargetDays,
  isFlexibleTarget,
  isPlanCountTarget,
  isPlanMirrorTarget,
  subjectTargetForDay,
  targetDayStatusText,
  targetForDay,
  weekDayGoal,
  weekGoalLegendText,
  type TargetDayRow,
} from '../../utils/targetDays';
import { readQuestionSubTab, readStudentTab, pushQuestionSubTab, type QuestionSubTab } from '../../lib/studentRoute';
import { addDaysYmd, dateOfDay, loadMyCurrentWeek, type PlanItem } from '../../services/studyPlanService';
import { normalizeSubject, shortSubjectName, targetSubjectList } from '../../lib/subjects';

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
// Aşama 65: günlük tablo telefonda (768 px altı) kart görünümüne geçer; her hücre solda başlığıyla (data-label) yazılır
const CELL_LABEL =
  'max-md:flex max-md:items-start max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1 max-md:text-right max-md:before:content-[attr(data-label)] max-md:before:shrink-0 max-md:before:text-[11px] max-md:before:font-semibold max-md:before:text-muted max-md:before:text-left';

export function generalDailyTarget(targets: WeeklyQuestionTarget[]): number {
  const general = targets.find((t) => !t.subject && !isPlanMirrorTarget(t, targets));
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
  const weekStartDay = dataService.getStudentWeekStartDay(studentId);
  const perDay: Record<string, number> = {};
  const weekCache = new Map<string, number>();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    let daily = DEFAULT_DAILY_QUESTION_TARGET;
    if (hasGeneralTarget) {
      const mon = getWeekStartOf(d, weekStartDay); // Aşama 43: öğrencinin haftası
      const monStr = formatDateISO(mon);
      if (!weekCache.has(monStr)) {
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        weekCache.set(monStr, generalDailyTarget(dataService.getQuestionTargetsForStudent(studentId, monStr, formatDateISO(sun))));
      }
      daily = weekCache.get(monStr) as number;
      // Öğretmen genel hedefi gün gün farklı dağıttıysa o günün kendi sayısı kullanılır
      const iso = formatDateISO(d);
      const flex = monthTargets.find(
        (t) => !t.subject && isFlexibleTarget(t) && (t.weekStartDate || '') <= iso && dataService.questionTargetEnd(t) >= iso
      );
      if (flex && isPlanMirrorTarget(flex, monthTargets)) {
        // Aşama 64: plandaki sayılarla doldurulmuş hedef: o günün hedefi plandaki ders hedeflerinin toplamı
        daily = monthTargets.filter((o) => isPlanCountTarget(o)).reduce((a, o) => a + targetForDay(o, iso), 0);
      } else if (flex) daily = targetForDay(flex, iso);
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

// HIZ (Aşama 84): dokunmatik cihazlarda (telefon / tablet) grafik çubukları "büyüyerek gelme" animasyonu olmadan
// çizilir. Animasyon 1,5 sn boyunca grafiği her karede yeniden çizip bölümün açılışını kasıyordu. Bilgisayarda aynen kalır.
const CHART_ANIMATE = !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);

/** Grafiklerde imleç arka planı (koyu temada parlak gri blok yerine tema rengi) */
export const CHART_BAR_CURSOR = { fill: 'var(--color-surface-3)', opacity: 0.55 };
export const CHART_LINE_CURSOR = { stroke: 'var(--color-line-strong)', strokeWidth: 1.5 };

/** Grafik renkleri */
export const CHART_COLORS = {
  met: 'var(--chart-1)',
  below: '#3b82f6',
  zero: '#f43f5e',
  target: '#ea580c',
  noTarget: '#94a3b8', // hedef verilmeyen günde çözülen sorular
};

/** Haftalık grafiğin açıklaması (iki ekranda aynı). targetText: "Günlük hedef (50)" vb. */
export const WeeklyChartLegend: React.FC<{ targetText: string; mode: 'bar' | 'area'; showNoTarget?: boolean }> = ({
  targetText,
  mode,
  showNoTarget,
}) => (
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
        {showNoTarget && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: CHART_COLORS.noTarget }} /> Hedef verilmeyen gün
          </span>
        )}
      </>
    ) : (
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded inline-block" style={{ background: CHART_COLORS.met }} /> Çözülen Soru
      </span>
    )}
    <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-300">
      <span className="w-4 border-t-2 border-dashed border-orange-500 inline-block" /> {targetText}
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

// Aşama 53: öğretmenin aktardığı konu / hedeflerin buluttan en son tazelendiği an (sık istek atılmasın)
let lastTargetsRefreshAt = 0;

interface StudentQuestionModuleProps {
  currentStudent: Student;
  classes: ClassGroup[];
  students: Student[];
}

// HIZ (Aşama 84): grafikler bölüm ekrana geldikten hemen sonra çizilir (yeri önceden ayrılır, sayfa zıplamaz).
// Grafik kütüphanesinin hesabı bölümün açılışını bekletmez; telefonda Sorular bölümü beklemeden açılır.
function useChartsAfterPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => startTransition(() => setReady(true)));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);
  return ready;
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
  const [planInfo, setPlanInfo] = useState('');
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
    window.setTimeout(() => setPlanInfo(''), 4000);
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
    if (now - lastTargetsRefreshAt < 20000) return;
    lastTargetsRefreshAt = now;
    void dataService.syncQuestionTargetsFromSupabase(true);
  }, [activeTab, entryDate]);

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

            {data.totalQuestions >= goal ? (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-300 font-semibold flex items-center gap-1 pt-1 border-t border-line">
                <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                <span>
                  {goal > 0
                    ? `Günlük Hedefe Ulaşıldı (%${Math.round((data.totalQuestions / goal) * 100)})`
                    : 'Bu güne soru hedefi verilmedi'}
                </span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-[11px] text-orange-600 dark:text-orange-300 font-medium pt-1 border-t border-line">
                Hedefe {goal - data.totalQuestions} soru kaldı (günün hedefi {goal})
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
          {/* Gün gün döküm kartların içinde değil, aşağıdaki birleşik günlük tabloda gösterilir */}
          <StudentTargetCards targets={activeTargets} studentId={activeStudent.id} logs={allLogs} hideDailyBreakdown />

          {/* Ana Grafik */}
          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm" id="student-weekly-chart">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div>
                <h4 className="text-base font-bold text-fg tracking-tight">
                  Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <WeeklyChartLegend
                  targetText={weekGoalLegendText(chartDays.map((d) => d.dayTarget || 0))}
                  mode={chartVisualType}
                  showNoTarget={chartDays.some((d) => !d.dayTarget && d.totalQuestions > 0)}
                />

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
              {chartsReady && (
              <ResponsiveContainer width="100%" height="100%">
                {chartVisualType === 'bar' ? (
                  <ComposedChart
                    data={chartDays}
                    margin={CHART_MARGIN}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey={shortDayLabels ? 'dayShortName' : 'dayName'}
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
                      domain={[0, (max: number) => { const top = Math.max(max, maxDayGoal, 1); return top + Math.max(2, Math.ceil(top * 0.15)); }]}
                      width={yAxisWidth}
                      allowDecimals={false}
                    />
                    <Tooltip content={renderLookerTooltip} cursor={CHART_BAR_CURSOR} />
                    <Bar dataKey="totalQuestions" radius={[6, 6, 0, 0]} maxBarSize={55} minPointSize={4} isAnimationActive={CHART_ANIMATE}>
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
                        const g = dayGoal(entry.dateStr);
                        const noTarget = g <= 0; // öğretmen bu güne hedef vermedi
                        const isAboveTarget = !noTarget && entry.totalQuestions >= g;
                        return (
                          <Cell
                            key={`cell-student-${index}`}
                            fill={isZero ? CHART_COLORS.zero : noTarget ? CHART_COLORS.noTarget : isAboveTarget ? CHART_COLORS.met : CHART_COLORS.below}
                          />
                        );
                      })}
                    </Bar>
                    {/* Günlük hedef: yalnızca hedef verilen günlerde (gün gün farklı olabilir) */}
                    <Line
                      type="linear"
                      dataKey="dayTarget"
                      name="Günlük hedef"
                      stroke={CHART_COLORS.target}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      connectNulls={false}
                      dot={{ r: 4, fill: CHART_COLORS.target, stroke: 'var(--color-surface)', strokeWidth: 1.5 }}
                      activeDot={{ r: 5, fill: CHART_COLORS.target }}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  </ComposedChart>
                ) : (
                  <ComposedChart
                    data={chartDays}
                    margin={CHART_MARGIN}
                  >
                    <defs>
                      <linearGradient id="studentNavyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey={shortDayLabels ? 'dayShortName' : 'dayName'}
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
                      domain={[0, (max: number) => { const top = Math.max(max, maxDayGoal, 1); return top + Math.max(2, Math.ceil(top * 0.15)); }]}
                      width={yAxisWidth}
                      allowDecimals={false}
                    />
                    <Tooltip content={renderLookerTooltip} cursor={CHART_LINE_CURSOR} />
                    <Area
                      type="monotone"
                      dataKey="totalQuestions"
                      stroke="var(--chart-1)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#studentNavyGradient)"
                      dot={{ r: 5, fill: 'var(--chart-1)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                      isAnimationActive={CHART_ANIMATE}
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
                    {/* Günlük hedef: yalnızca hedef verilen günlerde (gün gün farklı olabilir) */}
                    <Line
                      type="linear"
                      dataKey="dayTarget"
                      name="Günlük hedef"
                      stroke={CHART_COLORS.target}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      connectNulls={false}
                      dot={{ r: 4, fill: CHART_COLORS.target, stroke: 'var(--color-surface)', strokeWidth: 1.5 }}
                      activeDot={{ r: 5, fill: CHART_COLORS.target }}
                      isAnimationActive={false}
                      legendType="none"
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Günlük Veri Tablosu ve Ders Dağılımı */}
          {/* Aşama 65: tablo sayfanın tam genişliğinde (7 sütun sığsın); ders dağılımı kutusu altında */}
          <div className="grid grid-cols-1 gap-6">
            <div className="min-w-0 bg-surface border border-line rounded-2xl p-4 sm:p-5 shadow-sm">
              {/* Birleşik tablo: eski "Günlük Soru Çözüm ve Başarı Tablosu" + soru hedefi kartlarındaki "Gün gün durum" tablosu */}
              <h4 className="text-sm font-bold text-fg mb-1">Günlük Soru Çözüm, Hedef ve Başarı Tablosu</h4>
              <p className="text-[11px] text-muted mb-4 pb-2 border-b border-line" id="merged-daily-table-summary">
                {generalTargetRes
                  ? `${generalTargetRes.elapsedDays ? `${generalTargetRes.metDays}/${generalTargetRes.elapsedDays} günde genel hedef tuttu` : 'Henüz geçen gün yok'}${
                      generalTargetRes.flexible ? ' · Öğretmen soruları günlere farklı dağıttı' : ''
                    }`
                  : activeTargets.length
                    ? 'Ders hedeflerinin günlük durumu "Günlük Hedef" sütunundadır.'
                    : 'Bu hafta soru hedefi verilmedi; hedef sütunları boş görünür.'}
              </p>
              <div className="md:overflow-x-auto">
                <table className="w-full text-left text-xs max-md:block" id="merged-daily-table">
                  <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line max-md:hidden">
                    <tr>
                      <th className="px-2 lg:px-3 py-2.5">Gün</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Çözülen</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">D / Y</th>
                      <th className="px-2 lg:px-3 py-2.5">Ders Dağılımı</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Günlük Hedef</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Hedef Durumu</th>
                      <th className="px-2 lg:px-3 py-2.5 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line max-md:block max-md:divide-y-0 max-md:space-y-2">
                    {weeklyAnalytics.days.map((d) => {
                      const goalRow = dayGoalRow(d.dateStr);
                      const goal = dayGoal(d.dateStr);
                      const isFuture = d.dateStr > todayIso;
                      const isToday = d.dateStr === todayIso;
                      const hasGoal = goal > 0; // bu güne hedef verilmiş mi
                      const metTarget = hasGoal && d.totalQuestions >= goal;
                      const completionRate = hasGoal ? Math.min(100, Math.round((d.totalQuestions / goal) * 100)) : 0;
                      // Ders hedefleri (ör. yalnızca Matematik) — o güne denk gelenler
                      const subjectLines = subjectTargetRows
                        .map(({ t, res }) => {
                          const r = res.rows.find((x) => x.ymd === d.dateStr);
                          return r ? { label: t.subject as string, r } : null;
                        })
                        .filter((x): x is { label: string; r: TargetDayRow } => !!x && x.r.target > 0);
                      // Durum: genel hedef varsa onun gün durumu, yoksa çözülen soruya göre
                      let statusText: string;
                      let statusCls: string;
                      if (goalRow) {
                        statusText = targetDayStatusText(goalRow, generalTargetRes?.daily || dailyQuestionTarget);
                        statusCls =
                          goalRow.status === 'met'
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                            : goalRow.status === 'partial'
                              ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
                              : goalRow.status === 'none'
                                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                                : 'bg-surface-2 text-muted border-line';
                      } else if (!hasGoal) {
                        statusText = isFuture ? 'Henüz gelmedi' : d.hasSolved ? `Hedef yok · ${d.totalQuestions} soru` : 'Hedef verilmedi';
                        statusCls = 'bg-surface-2 text-muted border-line';
                      } else if (isFuture) {
                        statusText = 'Henüz gelmedi';
                        statusCls = 'bg-surface-2 text-muted border-line';
                      } else if (d.hasSolved) {
                        statusText = metTarget ? 'Hedef Tamamlandı' : isToday ? `Bugün · ${goal - d.totalQuestions} kaldı` : 'Kısmi Çözüm';
                        statusCls = metTarget
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30';
                      } else {
                        statusText = isToday ? 'Bugün · henüz girilmedi' : '0 Soru ⚠️';
                        statusCls = isToday
                          ? 'bg-surface-2 text-muted border-line'
                          : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30';
                      }
                      return (
                        <tr
                          key={d.dateStr}
                          data-testid="merged-daily-row"
                          className={`hover:bg-surface-2 transition-colors max-md:block max-md:rounded-xl max-md:border max-md:border-line max-md:px-3 max-md:py-2 ${isToday ? 'bg-orange-50/40 dark:bg-orange-500/5' : ''}`}
                        >
                          <td className="px-2 lg:px-3 py-2.5 whitespace-nowrap max-md:block max-md:px-0 max-md:pt-0 max-md:pb-1.5 max-md:mb-1 max-md:border-b max-md:border-line">
                            <span className="font-bold text-fg">{d.dayName}</span>
                            <span className="block text-[11px] text-muted">
                              {shortTurkishDate(d.dateStr)}
                              {isToday ? ' · bugün' : ''}
                            </span>
                          </td>
                          <td data-label="Çözülen" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <span className="font-extrabold text-fg text-sm">{isFuture && !d.hasSolved ? '—' : d.totalQuestions}</span>
                          </td>
                          <td data-label="Doğru / Yanlış" className={`px-2 lg:px-3 py-2.5 text-center whitespace-nowrap ${CELL_LABEL}`}>
                            {d.totalCorrect || d.totalWrong ? (
                              <span>
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">{d.totalCorrect}</span>
                                <span className="text-muted"> / </span>
                                <span className="font-bold text-rose-700 dark:text-rose-300">{d.totalWrong}</span>
                              </span>
                            ) : (
                              <span className="text-subtle">—</span>
                            )}
                          </td>
                          <td data-label="Ders dağılımı" className={`px-2 lg:px-3 py-2.5 text-muted min-w-[8rem] whitespace-normal break-words ${CELL_LABEL}`}>
                            {d.subjectsText || <span className="text-subtle italic">Ders kaydı yok</span>}
                          </td>
                          <td data-label="Günlük hedef" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <div>
                            <span className="font-extrabold text-fg">{goal > 0 ? goal : '—'}</span>
                            {goal <= 0 && <span className="block text-[10px] text-muted">hedef yok</span>}
                            {subjectLines.map(({ label, r }) => (
                              <span
                                key={label}
                                className={`block text-[10px] font-semibold leading-snug ${
                                  r.status === 'met' ? 'text-emerald-700 dark:text-emerald-300' : r.status === 'future' ? 'text-muted' : 'text-orange-700 dark:text-orange-300'
                                }`}
                                title={`${label} hedefi`}
                              >
                                {label}: {r.status === 'future' ? '—' : r.solved}/{r.target}
                                {r.status === 'met' ? ' ✓' : ''}
                              </span>
                            ))}
                            </div>
                          </td>
                          <td data-label="Hedef durumu" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <div className="inline-flex items-center gap-1.5">
                              <div className="w-12 bg-surface-3 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${metTarget ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                  style={{ width: `${isFuture && !d.hasSolved ? 0 : completionRate}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-muted">{hasGoal ? `%${isFuture && !d.hasSolved ? 0 : completionRate}` : '—'}</span>
                            </div>
                          </td>
                          <td data-label="Durum" className={`px-2 lg:px-3 py-2.5 text-center ${CELL_LABEL}`}>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold leading-tight border ${statusCls}`}>
                              {statusText}
                            </span>
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
                  className="px-3 py-1.5 bg-fg hover:bg-fg text-surface rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-orange-400" />
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
              {chartsReady && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAnalytics.weeks} margin={{ top: 25, right: isNarrow ? 10 : 18, left: 0, bottom: 5 }}>
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
                  <YAxis stroke="var(--color-muted)" fontSize={isNarrow ? 10 : 12} fontWeight={600} tickLine={false} allowDecimals={false} width={String(Math.max(1, ...monthlyAnalytics.weeks.map((w) => Number(w.totalQuestions) || 0))).length * (isNarrow ? 6.5 : 7.5) + (isNarrow ? 12 : 16)} />
                  <Tooltip content={<MonthlyBucketTooltip plan={monthlyPlan} />} cursor={CHART_BAR_CURSOR} />
                  <Bar dataKey="totalQuestions" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={60} isAnimationActive={CHART_ANIMATE}>
                    <LabelList dataKey="totalQuestions" position="top" fill="var(--color-fg)" fontSize={isNarrow ? 10 : 12} fontWeight={800} offset={8} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
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

          {/* Aşama 52: "Öğretmenin bu gün için aktardığı konular" bilgilendirmesi kaldırıldı; konular ders satırına
              kendiliğinden yazılıyor. */}

          {/* Günlük plandaki görevler: yalnızca öğretmenin OTOMATİK AKTARMADIĞI görevler varsa çıkar; öğrenci isterse elle ekler */}
          {manualPlanTasks.length > 0 && !dateError && (
            <div
              id="qe-plan-tasks"
              className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 space-y-2"
            >
              <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4" />
                {formatTurkishDate(entryDate)} günlük planındaki görevler
                <span className="font-medium text-indigo-700/80 dark:text-indigo-300/80">(isteğe bağlı · tıklayınca konu kutusuna aktarılır)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {manualPlanTasks.map((it) => {
                  const text = planTaskText(it);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      data-testid="qe-plan-chip"
                      disabled={!text}
                      onClick={() => transferPlanTasks(it.subject, [it])}
                      title={text ? 'Konu / Test kutusuna aktar' : 'Bu görevde aktarılacak yazı yok'}
                      className="inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg bg-surface border border-indigo-200 dark:border-indigo-500/30 text-[11px] text-fg hover:border-indigo-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="font-bold text-indigo-700 dark:text-indigo-300 shrink-0">{it.subject}</span>
                      <span className="truncate">{text || '—'}</span>
                      {it.questionCount > 0 && <span className="shrink-0 font-bold text-indigo-700 dark:text-indigo-300">· {it.questionCount} soru</span>}
                      {it.doneAt && <Check className="w-3 h-3 text-emerald-600 shrink-0" aria-label="yapıldı" />}
                      <Plus className="w-3 h-3 text-indigo-600 dark:text-indigo-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
              {planInfo && (
                <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300" role="status">
                  {planInfo}
                </p>
              )}
            </div>
          )}

          {/* Aşama 53: gelecek hafta hedefi (öğretmenin planından otomatik) */}
          {nextWeekPlan && (
            <div
              id="qe-next-week"
              className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 space-y-2"
            >
              <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Gelecek hafta hedefin
                <span className="font-medium text-indigo-700/80 dark:text-indigo-300/80">
                  ({formatTurkishDate(nextWeekPlan.start)} – {formatTurkishDate(nextWeekPlan.end)})
                </span>
              </p>
              <div className="grid grid-cols-7 gap-1">
                {nextWeekPlan.days.map((d) => {
                  const dt = parseIsoDate(d.date);
                  const empty = !d.subjects.length && d.general <= 0;
                  return (
                    <div
                      key={d.date}
                      data-testid="qe-next-week-day"
                      className={`min-w-0 rounded-lg border px-1 py-1 text-center ${empty ? 'border-line bg-surface-2/40' : 'border-indigo-200 dark:border-indigo-500/30 bg-surface'}`}
                      title={d.topics.map((x) => `${x.subject}: ${x.topic}`).join('\n') || undefined}
                    >
                      <span className="block text-[10px] font-bold text-fg leading-tight">
                        {dt ? ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][dt.getDay()] : ''}
                      </span>
                      <span className="block text-[9px] text-muted leading-tight">{dt ? `${dt.getDate()}.${dt.getMonth() + 1}` : ''}</span>
                      {d.general > 0 && <span className="block text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">Toplam:{d.general}</span>}
                      {d.subjects.map(([s, n]) => (
                        <span key={s} className="block text-[10px] leading-tight font-semibold text-indigo-700 dark:text-indigo-300 break-words">
                          {shortSubjectName(s)}:{n}
                        </span>
                      ))}
                      {empty && <span className="block text-[10px] text-subtle">—</span>}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted">
                Öğretmenin planından otomatik oluşturuldu. O gün geldiğinde dersin konusu ve hedefi bu formda ilgili dersin satırına kendiliğinden yazılır.
              </p>
            </div>
          )}

          {/* Seçilen günün genel (tüm dersler) soru hedefi */}
          {generalDayTarget !== null && !dateError && (
            <div
              id="qe-general-target"
              className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/60 dark:bg-orange-500/10 text-xs"
            >
              <Target className="w-4 h-4 text-orange-600 dark:text-orange-300" />
              <span className="font-bold text-fg">
                {formatTurkishDate(entryDate)} için toplam girmen gereken: {generalDayTarget} soru
              </span>
              <span className="text-muted">· Formdaki toplam: {formTotal}</span>
              {formTotal > 0 && formTotal < generalDayTarget ? (
                <span
                  role="alert"
                  data-testid="qe-general-below-target"
                  className="qe-blink inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold"
                >
                  <AlertTriangle className="w-3 h-3" /> Soru hedefinin altında kaldın ({generalDayTarget - formTotal} eksik)
                </span>
              ) : formTotal >= generalDayTarget ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Günlük hedef tamam
                </span>
              ) : null}
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
                  const rowTarget = subjectDayTarget(row.subject);
                  const rowEntered = row.questionCount.trim() !== '' && check.count !== null && !hasError;
                  const rowBelow = rowTarget !== null && rowEntered && (check.count || 0) < rowTarget;
                  const rowMet = rowTarget !== null && rowEntered && (check.count || 0) >= rowTarget;
                  const rowPlanTasks = planTasksFor(row.subject);
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
                      <div className="block col-span-2 sm:col-span-1">
                        <span className="sm:hidden block text-[11px] font-semibold text-muted mb-1">Konu / Test</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            maxLength={120}
                            placeholder="Konu adı..."
                            aria-label={`${row.subject} konu`}
                            data-testid="qe-topic"
                            value={row.topic}
                            onChange={(e) => updateListRow(idx, 'topic', e.target.value)}
                            className="w-full min-w-0 bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 sm:py-1 text-xs text-fg focus:border-orange-500 focus:outline-none"
                          />
                          {rowPlanTasks.length > 0 && (
                            <button
                              type="button"
                              data-testid="qe-plan-transfer"
                              onClick={() => transferPlanTasks(row.subject, rowPlanTasks)}
                              title={`Günlük plandaki görevi aktar: ${rowPlanTasks.map(planTaskText).join(', ')}`}
                              aria-label={`${row.subject} için günlük plandaki görevi konu kutusuna aktar`}
                              className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-1 rounded-md border border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 cursor-pointer"
                            >
                              <ClipboardList className="w-3 h-3" />
                              Plan
                            </button>
                          )}
                        </div>
                      </div>
                      {rowTarget !== null && (
                        <div className="col-span-2 sm:col-span-6 -mt-1 flex flex-wrap items-center gap-2 text-[11px]" data-testid="qe-row-target">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 font-bold">
                            <Target className="w-3 h-3" /> Bugün girmen gereken: {rowTarget} soru
                          </span>
                          {rowBelow && (
                            <span
                              role="alert"
                              data-testid="qe-row-below-target"
                              className="qe-blink inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold"
                            >
                              <AlertTriangle className="w-3 h-3" /> Soru hedefinin altında kaldın ({rowTarget - (check.count || 0)} eksik)
                            </span>
                          )}
                          {rowMet && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold">
                              <CheckCircle2 className="w-3 h-3" /> Hedef tamam
                            </span>
                          )}
                        </div>
                      )}
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
                  {subjectDayTarget(singleSubject) !== null && (
                    <span className="block mt-1 text-[10px] font-bold text-orange-700 dark:text-orange-300" id="qe-single-target-hint">
                      Hedef: {subjectDayTarget(singleSubject)} soru
                    </span>
                  )}
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
                  <div className="flex items-center gap-1">
                    <input
                      id="qe-single-topic"
                      type="text"
                      maxLength={120}
                      placeholder="Konu adı..."
                      value={singleTopic}
                      onChange={(e) => setSingleTopic(e.target.value)}
                      className="w-full min-w-0 bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-fg"
                    />
                    {planTasksFor(singleSubject).length > 0 && (
                      <button
                        type="button"
                        id="qe-single-plan-transfer"
                        onClick={() => transferPlanTasks(singleSubject, planTasksFor(singleSubject))}
                        title="Günlük plandaki görevi aktar"
                        aria-label="Günlük plandaki görevi konu kutusuna aktar"
                        className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-1.5 rounded-md border border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold cursor-pointer"
                      >
                        <ClipboardList className="w-3 h-3" />
                        Plan
                      </button>
                    )}
                  </div>
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
                    const tgt = subjectDayTarget(item.subject);
                    const below = tgt !== null && item.questionCount < tgt;
                    return (
                      <div key={`${item.subject}-${idx}`} data-testid="qe-single-row" className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs hover:bg-surface-2">
                        <div className="min-w-0">
                          <span className="font-bold text-fg">{item.subject}</span>
                          <span className="ml-2 font-bold text-fg">{item.questionCount} soru</span>
                          <span className="ml-2 text-muted">
                            D {c} · Y {w} · B {Math.max(0, item.questionCount - c - w)}
                          </span>
                          {tgt !== null && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 font-bold text-[11px]" data-testid="qe-single-row-target">
                              <Target className="w-3 h-3" /> Girmen gereken: {tgt}
                            </span>
                          )}
                          {below && (
                            <span role="alert" className="qe-blink ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[11px]" data-testid="qe-single-row-below">
                              <AlertTriangle className="w-3 h-3" /> Soru hedefinin altında kaldın ({(tgt as number) - item.questionCount} eksik)
                            </span>
                          )}
                          {tgt !== null && !below && (
                            <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                              <CheckCircle2 className="w-3 h-3" /> Hedef tamam
                            </span>
                          )}
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
              className="px-3.5 py-1.5 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <Check className="w-3.5 h-3.5 text-orange-400" />
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
