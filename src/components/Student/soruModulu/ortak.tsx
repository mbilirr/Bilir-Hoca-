// Öğrenci soru modülü: sayfanın ortak yardımcıları (Aşama 354c, StudentQuestionModule.tsx bölündü)
import React, { useState, useEffect, startTransition } from 'react';
import { Student, ClassGroup, QuestionLogSubjectEntry, WeeklyQuestionTarget } from '../../../types';
import { dataService } from '../../../services/dataService';
import { formatDateISO, getWeekStartOf, TURKISH_MONTHS } from '../../../utils/questionAnalytics';
import { isFlexibleTarget, isPlanCountTarget, isPlanMirrorTarget, targetForDay } from '../../../utils/targetDays';

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
export const CELL_LABEL =
  'max-md:flex max-md:items-start max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1 max-md:text-right max-md:before:content-[attr(data-label)] max-md:before:shrink-0 max-md:before:text-xs max-md:before:font-semibold max-md:before:text-muted max-md:before:text-left';

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
      <rect x={x} y={y} width={width} height={17} rx={5} fill="var(--color-surface)" stroke="var(--color-warning)" strokeWidth={1} opacity={0.95} />
      <text x={x + 6} y={y + 12.5} fill="var(--color-warning)" fontSize={11} fontWeight={700}>
        {text}
      </text>
    </g>
  );
};

// HIZ (Aşama 84): dokunmatik cihazlarda (telefon / tablet) grafik çubukları "büyüyerek gelme" animasyonu olmadan
// çizilir. Animasyon 1,5 sn boyunca grafiği her karede yeniden çizip bölümün açılışını kasıyordu. Bilgisayarda aynen kalır.
export const CHART_ANIMATE = !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);

/** Grafiklerde imleç arka planı (koyu temada parlak gri blok yerine tema rengi) */
export const CHART_BAR_CURSOR = { fill: 'var(--color-surface-3)', opacity: 0.55 };

export const CHART_LINE_CURSOR = { stroke: 'var(--color-line-strong)', strokeWidth: 1.5 };

/** Grafik renkleri */
export const CHART_COLORS = {
  met: 'var(--chart-1)',
  below: 'var(--color-info)', // Aşama 279: grafik renkleri token'dan (koyu temada da doğru)
  zero: 'var(--color-danger)',
  target: 'var(--color-warning)',
  noTarget: 'var(--color-subtle)', // hedef verilmeyen günde çözülen sorular
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
        <span className="flex items-center gap-1.5 text-danger-fg">
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
    <span className="flex items-center gap-1.5 text-warning-fg">
      <span className="w-4 border-t-2 border-dashed border-warning inline-block" /> {targetText}
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
            <strong className="text-success-fg">{w.totalCorrect}</strong> /{' '}
            <strong className="text-danger-fg">{w.totalWrong}</strong>
          </span>
        </div>
      ) : null}
      {w.topSubject && w.topSubject !== '—' && (
        <div className="flex justify-between text-muted">
          <span>En çok çalışılan:</span>
          <strong className="text-fg">{w.topSubject}</strong>
        </div>
      )}
      <div className="pt-1 border-t border-line text-xs text-muted">
        Bu {dayCount} günün hedefi: <strong className="text-fg">{bucketTarget} soru</strong> (%{pct})
      </div>
    </div>
  );
};

// =============================================================================
// Soru giriş formu yardımcıları
// =============================================================================

export type EntryRow = { subject: string; questionCount: string; correctCount: string; wrongCount: string; topic: string };

export const emptyEntryRow = (subject: string): EntryRow => ({
  subject,
  questionCount: '',
  correctCount: '',
  wrongCount: '',
  topic: '',
});

export const rowHasContent = (r: EntryRow) =>
  !!(r.questionCount.trim() || r.correctCount.trim() || r.wrongCount.trim() || r.topic.trim());

/** Sayı alanı: boş → null; yalnızca rakam, 0..1000 */
export function parseCountField(raw: string, label: string): { value: number | null; error?: string } {
  const t = (raw ?? '').trim();
  if (t === '') return { value: null };
  if (!/^\d+$/.test(t)) return { value: null, error: `${label}: yalnızca tam sayı girebilirsin.` };
  const n = parseInt(t, 10);
  if (n > MAX_QUESTION_COUNT) return { value: null, error: `${label}: en fazla ${MAX_QUESTION_COUNT} olabilir.` };
  return { value: n };
}

export interface EntryRowCheck {
  count: number | null;
  correct: number | null;
  wrong: number | null;
  empty: number | null;
  errors: string[];
  invalid: { count: boolean; correct: boolean; wrong: boolean };
}

export function checkEntryRow(r: EntryRow): EntryRowCheck {
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
export function mergeSubjectEntries(entries: QuestionLogSubjectEntry[]): QuestionLogSubjectEntry[] {
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
export function buildEntryRows(subjects: string[], entries: QuestionLogSubjectEntry[]): EntryRow[] {
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
export const blockNonDigitKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
};

/** Yapıştırılan metinden yalnızca rakamlar alınır */
export const pasteDigitsOnly = (setter: (v: string) => void) => (e: React.ClipboardEvent<HTMLInputElement>) => {
  e.preventDefault();
  const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
  setter(digits);
};

// Aşama 53: öğretmenin aktardığı konu / hedeflerin buluttan en son tazelendiği an (sık istek atılmasın)
// (Aşama 354c: modüller arası yazılabilsin diye nesne içinde; değer sayfa kapanıp açılınca da korunur)
export const hedefTazeleme = { son: 0 };

export interface StudentQuestionModuleProps {
  currentStudent: Student;
  classes: ClassGroup[];
  students: Student[];
}

// HIZ (Aşama 84): grafikler bölüm ekrana geldikten hemen sonra çizilir (yeri önceden ayrılır, sayfa zıplamaz).
// Grafik kütüphanesinin hesabı bölümün açılışını bekletmez; telefonda Sorular bölümü beklemeden açılır.
export function useChartsAfterPaint(): boolean {
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
