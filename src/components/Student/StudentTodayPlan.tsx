import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarCheck, Check, ChevronDown, ChevronUp, PartyPopper, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cx } from '../ui/kit';
import {
  PLAN_DAYS,
  dateOfDay,
  dayIndexOf,
  loadMyWeek,
  setTaskDone,
  shortDayLabel,
  weekRangeLabel,
  weekStartOf,
  ymd,
  type PlanItem,
} from '../../services/studyPlanService';

// ============================================================================
// Öğrenci ana sayfası: "Bugün yapılması gerekenler" (Aşama 19)
// Öğretmenin ödev olarak gönderdiği haftalık çalışma planının bugünkü görevleri.
// Öğrenci her görevi "yaptım" diye işaretleyebilir; geçen günlerden kalanlar ayrıca uyarılır.
// ============================================================================

export const StudentTodayPlan: React.FC = () => {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [items, setItems] = useState<PlanItem[]>([]);
  const [sentBy, setSentBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showWeek, setShowWeek] = useState(false);
  const pending = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const ws = weekStartOf(new Date());
    setWeekStart((prev) => (prev === ws ? prev : ws));
    try {
      const r = await loadMyWeek(ws);
      // Sunucudan gelen veri, bu sırada işaretlenmekte olan görevlerin yerel durumunu ezmesin
      setItems((cur) => r.items.map((i) => (pending.current.has(i.id) ? cur.find((c) => c.id === i.id) || i : i)));
      setSentBy(r.sentByName);
    } catch {
      /* ağ hatasında eski liste kalır */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    const timer = window.setInterval(() => void refresh(), 90000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const today = new Date();
  const todayIdx = dayIndexOf(today);
  const todayStr = ymd(today);
  const todayItems = useMemo(() => items.filter((i) => i.day === todayIdx), [items, todayIdx]);
  const overdue = useMemo(() => items.filter((i) => i.day < todayIdx && !i.doneAt), [items, todayIdx]);
  const doneToday = todayItems.filter((i) => i.doneAt).length;
  const allDone = todayItems.length > 0 && doneToday === todayItems.length;

  const toggle = async (it: PlanItem) => {
    if (pending.current.has(it.id)) return;
    const next = !it.doneAt;
    pending.current.add(it.id);
    setError(null);
    setItems((cur) => cur.map((i) => (i.id === it.id ? { ...i, doneAt: next ? new Date().toISOString() : null } : i)));
    try {
      await setTaskDone(it.id, next);
      if (next && it.day === todayIdx && todayItems.filter((i) => i.id !== it.id).every((i) => i.doneAt)) {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.55 } });
      }
    } catch (e: any) {
      setItems((cur) => cur.map((i) => (i.id === it.id ? { ...i, doneAt: it.doneAt } : i)));
      setError(e?.message || 'İşaret kaydedilemedi. Lütfen tekrar dene.');
    } finally {
      pending.current.delete(it.id);
    }
  };

  // Plan hiç gönderilmemişse (ya da bu hafta görev yoksa) kart hiç görünmez
  if (items.length === 0) return null;

  const renderRow = (it: PlanItem) => {
    const done = !!it.doneAt;
    return (
      <li
        key={it.id}
        data-today-task={it.id}
        data-done={done ? '1' : '0'}
        className={cx('flex items-start gap-3 rounded-xl px-3 py-3 border transition-colors', done ? 'bg-white/8 border-white/15' : 'bg-white/15 border-white/30')}
      >
        <button
          type="button"
          data-task-toggle
          aria-pressed={done}
          aria-label={done ? 'Yapıldı işaretini kaldır' : 'Yaptım olarak işaretle'}
          onClick={() => toggle(it)}
          className={cx(
            'mt-0.5 w-8 h-8 shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all active:scale-90',
            done ? 'bg-white border-white text-indigo-700' : 'border-white/80 text-transparent hover:bg-white/20'
          )}
        >
          <Check className="w-5 h-5" strokeWidth={3} />
        </button>
        <div className={cx('min-w-0 flex-1 space-y-1', done && 'opacity-70')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex px-2 py-0.5 rounded-full bg-white/25 text-[11px] font-black tracking-wide">{it.subject}</span>
            {it.book && (
              <span className="inline-flex items-center gap-1 text-xs font-bold">
                <BookOpen className="w-3.5 h-3.5" /> {it.book}
              </span>
            )}
          </div>
          {it.note && <p className={cx('text-sm font-medium whitespace-pre-wrap break-words', done && 'line-through')}>{it.note}</p>}
        </div>
      </li>
    );
  };

  const dateText = today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section
      id="student-today-plan"
      aria-label="Bugün yapılması gerekenler"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white p-4 sm:p-6 shadow-xl shadow-indigo-500/25 border-2 border-indigo-300/40"
    >
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="relative z-10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white text-indigo-800 uppercase tracking-wider">Bugün yapılması gerekenler</span>
              <p className="text-sm font-bold mt-1 capitalize">{dateText}</p>
            </div>
          </div>
          {todayItems.length > 0 && (
            <div className="text-right" id="student-today-count">
              <p className="text-2xl font-black leading-none tabular-nums">
                {doneToday}/{todayItems.length}
              </p>
              <p className="text-[11px] font-semibold text-indigo-100">görev tamamlandı</p>
            </div>
          )}
        </div>

        {todayItems.length > 0 && (
          <div className="h-2 rounded-full bg-white/25 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.round((doneToday / todayItems.length) * 100)}%` }} />
          </div>
        )}

        {allDone && (
          <div id="student-today-alldone" className="flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-bold">
            <PartyPopper className="w-4 h-4" /> Harika! Bugünkü görevlerin tamam.
          </div>
        )}

        {todayItems.length > 0 ? (
          <ul className="space-y-2" id="student-today-list">
            {todayItems.map((it) => renderRow(it))}
          </ul>
        ) : (
          <p className="text-sm font-semibold text-indigo-50" id="student-today-empty">
            Bugün için planlanmış görevin yok.
          </p>
        )}

        {overdue.length > 0 && (
          <div className="rounded-xl bg-amber-400/20 border border-amber-200/50 p-3 space-y-2" id="student-today-overdue">
            <p className="flex items-center gap-1.5 text-xs font-black text-amber-100">
              <AlertTriangle className="w-4 h-4" /> Geçen günlerden kalan {overdue.length} görev
            </p>
            <ul className="space-y-2">
              {overdue.map((it) => renderRow(it))}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-bold bg-rose-500/80 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div>
          <button
            type="button"
            id="student-plan-week-toggle"
            aria-expanded={showWeek}
            onClick={() => setShowWeek((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-50 hover:text-white underline-offset-2 hover:underline cursor-pointer"
          >
            {showWeek ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Bu haftanın planı ({weekRangeLabel(weekStart)})
          </button>
          {showWeek && (
            <div id="student-plan-week" className="mt-3 space-y-3">
              {PLAN_DAYS.map((name, d) => {
                const list = items.filter((i) => i.day === d);
                if (!list.length) return null;
                const date = dateOfDay(weekStart, d);
                return (
                  <div key={d} data-week-day={d}>
                    <p className={cx('text-xs font-black uppercase tracking-wide mb-1.5', date === todayStr ? 'text-white' : 'text-indigo-100')}>
                      {name} · {shortDayLabel(date)}
                      {date === todayStr && ' (bugün)'}
                    </p>
                    <ul className="space-y-2">
                      {list.map((it) => renderRow(it))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {sentBy && <p className="text-[11px] text-indigo-100/90">Planı hazırlayan: {sentBy}</p>}
      </div>
    </section>
  );
};
