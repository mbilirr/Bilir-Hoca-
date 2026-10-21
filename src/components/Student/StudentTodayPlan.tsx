import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarCheck, Check, ChevronDown, ChevronUp, PartyPopper, AlertTriangle, ListChecks } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import {
  PLAN_DAYS,
  dateOfDay,
  dayIndexOf,
  loadMyCurrentWeek,
  planDayName,
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

export const StudentTodayPlan: React.FC<{
  /** Küçük (yarı boyut) görünüm: ana sayfada "Durumum" kartlarının yanında kullanılır */
  compact?: boolean;
}> = ({ compact = false }) => {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [items, setItems] = useState<PlanItem[]>([]);
  const [sentBy, setSentBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showWeek, setShowWeek] = useState(false);
  const pending = useRef(new Set<string>());
  // Aşama 46: görevin soruları soru kaydına aktarılır; öğrenci fazlasını çözdüyse sayıyı günceller
  const [info, setInfo] = useState<string | null>(null);
  const infoTimer = useRef<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [, setLogsTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setLogsTick((n) => n + 1)), []);
  useEffect(
    () => () => {
      if (infoTimer.current) window.clearTimeout(infoTimer.current);
    },
    []
  );
  const showInfo = (msg: string) => {
    setInfo(msg);
    if (infoTimer.current) window.clearTimeout(infoTimer.current);
    infoTimer.current = window.setTimeout(() => setInfo(null), 7000);
  };
  const dayText = (d: string) => (d === ymd(new Date()) ? 'bugün' : shortDayLabel(d));

  const refresh = useCallback(async () => {
    try {
      // Bugünü kapsayan gönderilmiş plan (hangi gün başlarsa başlasın); yoksa Pazartesi başlayan hafta
      const r = await loadMyCurrentWeek(new Date());
      setWeekStart((prev) => (prev === r.weekStart ? prev : r.weekStart));
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
  const todayIdx = dayIndexOf(today, weekStart);
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
      pending.current.delete(it.id);
      return;
    }
    // Aşama 46: görevde soru sayısı varsa soru kaydına aktarılır (işaret kaldırılınca geri alınır)
    try {
      const before = dataService.getPlanTaskQuestionShare(it.id);
      if (next && it.questionCount > 0 && !before) {
        const req = { itemId: it.id, subject: it.subject, date: dateOfDay(weekStart, it.day), count: it.questionCount };
        let r = await dataService.setPlanTaskQuestions(req);
        // Aşama 67: aktarım kaydedildikten sonra pay görünmüyorsa (art arda işaretlemede gecikmiş eşitleme) bir kez daha
        // yazılır. İşlem tekrarlansa da sorular iki kez eklenmez: görevin payı varsa yalnızca aynı sayıya güncellenir.
        if (!dataService.getPlanTaskQuestionShare(it.id)) r = await dataService.setPlanTaskQuestions(req);
        showInfo(`${r.subject}: ${r.count} soru, ${dayText(r.date)} soru kaydına otomatik eklendi ve kaydedildi. Fazlasını çözdüysen "Düzenle" ile güncelleyebilirsin.`);
      } else if (!next && before) {
        await dataService.setPlanTaskQuestions({ itemId: it.id, subject: it.subject, date: before.date, count: 0 });
        if (editId === it.id) setEditId(null);
        showInfo(`${before.subject}: ${before.count} soru, ${dayText(before.date)} soru kaydından çıkarıldı.`);
      }
    } catch (e: any) {
      setError(`Görev işaretlendi ama soru kaydı güncellenemedi: ${e?.message || 'bağlantı sorunu'}. Soru Kaydet bölümünden elle girebilirsin.`);
    } finally {
      pending.current.delete(it.id);
      setLogsTick((n) => n + 1); // "aktarılıyor" yazısı kalksın
    }
  };

  const startEdit = (it: PlanItem) => {
    const share = dataService.getPlanTaskQuestionShare(it.id);
    setEditId(it.id);
    setEditValue(String(share ? share.count : it.questionCount));
    setError(null);
  };
  const saveEdit = async (it: PlanItem) => {
    if (editSaving) return;
    const v = editValue.trim();
    if (!/^\d{1,4}$/.test(v) || Number(v) > 1000) {
      setError('Soru sayısı 0 ile 1000 arasında bir tam sayı olmalı.');
      return;
    }
    const n = Number(v);
    const share = dataService.getPlanTaskQuestionShare(it.id);
    setEditSaving(true);
    setError(null);
    try {
      const r = await dataService.setPlanTaskQuestions({
        itemId: it.id,
        subject: it.subject,
        date: share ? share.date : dateOfDay(weekStart, it.day),
        count: n,
      });
      setEditId(null);
      showInfo(
        n > 0
          ? `${r.subject}: bu görevden ${n} soru kayıtlı (${r.date === ymd(new Date()) ? 'bugünkü' : `${shortDayLabel(r.date)} günü`} ${r.subject} toplamı: ${r.subjectTotal} soru).`
          : `${it.subject}: bu görevin soruları soru kaydından çıkarıldı.`
      );
    } catch (e: any) {
      setError(e?.message || 'Soru kaydı güncellenemedi. Lütfen tekrar dene.');
    } finally {
      setEditSaving(false);
    }
  };

  const dateText = today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Plan hiç gönderilmemişse (ya da bu hafta görev yoksa): normal görünümde kart hiç görünmez,
  // küçük görünümde (ana sayfa yan paneli) yerleşim bozulmasın diye sade bir bilgi kartı gösterilir
  if (items.length === 0) {
    if (!compact) return null;
    return (
      <section
        id="student-today-plan"
        aria-label="Bugün yapılması gerekenler"
        className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-3 shadow-md border border-indigo-300/40"
      >
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black bg-white text-indigo-800 uppercase tracking-wider">
              Bugün yapılması gerekenler
            </span>
            <p className="text-[11px] font-bold mt-0.5 capitalize">{dateText}</p>
          </div>
        </div>
        <p className="text-xs font-semibold text-indigo-50 mt-2" id="student-today-empty">
          Bu hafta için gönderilmiş çalışma planın yok.
        </p>
      </section>
    );
  }

  // Yapılan görevin soru kaydındaki payı: "Soru kaydında: 40 soru · Düzenle"
  const renderShare = (it: PlanItem) => {
    const share = dataService.getPlanTaskQuestionShare(it.id);
    const busy = pending.current.has(it.id);
    if (editId === it.id) {
      return (
        <form
          data-task-share-edit
          className="flex flex-wrap items-center gap-1.5 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit(it);
          }}
        >
          <label className="text-[11px] font-bold" htmlFor={`share-${it.id}`}>
            Çözdüğün soru:
          </label>
          <input
            id={`share-${it.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-16 h-7 min-h-0 rounded-lg border border-white/60 bg-white px-2 py-0 text-xs font-black text-indigo-900 outline-none focus:ring-2 focus:ring-white"
            autoFocus
          />
          <button
            type="submit"
            disabled={editSaving}
            className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-black text-indigo-800 hover:bg-indigo-50 disabled:opacity-60 cursor-pointer"
          >
            {editSaving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button
            type="button"
            disabled={editSaving}
            onClick={() => setEditId(null)}
            className="rounded-lg border border-white/50 px-2 py-0.5 text-[11px] font-bold hover:bg-white/15 cursor-pointer"
          >
            Vazgeç
          </button>
        </form>
      );
    }
    return (
      <div data-task-share className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] font-bold text-indigo-50">
        <ListChecks className="w-3.5 h-3.5 shrink-0" />
        {share ? (
          <span data-task-share-count>
            Soru kaydında: {share.count} soru{share.date !== ymd(new Date()) ? ` (${shortDayLabel(share.date)})` : ''}
          </span>
        ) : (
          <span>{busy ? 'Soru kaydına aktarılıyor…' : 'Soru kaydına aktarılmadı'}</span>
        )}
        {!busy && (
          <button
            type="button"
            data-task-share-btn
            onClick={() => startEdit(it)}
            className="rounded-md bg-white/20 px-1.5 py-0.5 font-black hover:bg-white/30 cursor-pointer"
          >
            {share ? 'Düzenle' : 'Soru kaydına ekle'}
          </button>
        )}
      </div>
    );
  };

  const renderRow = (it: PlanItem) => {
    const done = !!it.doneAt;
    return (
      <li
        key={it.id}
        data-today-task={it.id}
        data-done={done ? '1' : '0'}
        className={cx(
          'flex items-start rounded-xl border transition-colors',
          compact ? 'gap-2 px-2 py-1.5' : 'gap-3 px-3 py-3',
          done ? 'bg-white/8 border-white/15' : 'bg-white/15 border-white/30'
        )}
      >
        <button
          type="button"
          data-task-toggle
          aria-pressed={done}
          aria-label={done ? 'Yapıldı işaretini kaldır' : 'Yaptım olarak işaretle'}
          onClick={() => toggle(it)}
          className={cx(
            'mt-0.5 shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all active:scale-90',
            compact ? 'w-6 h-6' : 'w-8 h-8',
            done ? 'bg-white border-white text-indigo-700' : 'border-white/80 text-transparent hover:bg-white/20'
          )}
        >
          <Check className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} strokeWidth={3} />
        </button>
        <div className={cx('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
          <div className={cx(compact ? 'space-y-0.5' : 'space-y-1', done && 'opacity-70')}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cx('inline-flex px-2 py-0.5 rounded-full bg-white/25 font-black tracking-wide', compact ? 'text-[10px]' : 'text-[11px]')}>{it.subject}</span>
            {it.book && (
              <span className={cx('inline-flex items-center gap-1 font-bold', compact ? 'text-[11px]' : 'text-xs')}>
                <BookOpen className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} /> {it.book}
              </span>
            )}
            {it.questionCount > 0 && (
              <span className={cx('inline-flex px-2 py-0.5 rounded-full bg-white text-indigo-800 font-black', compact ? 'text-[10px]' : 'text-[11px]')} data-task-qcount>
                {it.questionCount} soru
              </span>
            )}
          </div>
          {it.note && (
            <p className={cx('font-medium whitespace-pre-wrap break-words', compact ? 'text-xs' : 'text-sm', done && 'line-through')}>{it.note}</p>
          )}
          </div>
          {done && it.questionCount > 0 && renderShare(it)}
        </div>
      </li>
    );
  };

  return (
    <section
      id="student-today-plan"
      aria-label="Bugün yapılması gerekenler"
      className={cx(
        'relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white border-indigo-300/40',
        compact ? 'p-3 shadow-md border' : 'p-4 sm:p-6 shadow-xl shadow-indigo-500/25 border-2'
      )}
    >
      <div className={cx('absolute bg-white/10 rounded-full blur-2xl pointer-events-none', compact ? '-right-6 -top-6 w-20 h-20' : '-right-8 -top-8 w-40 h-40')} />
      <div className={cx('relative z-10', compact ? 'space-y-2.5' : 'space-y-4')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cx(
                'bg-white/20 border border-white/30 flex items-center justify-center shrink-0',
                compact ? 'w-8 h-8 rounded-xl' : 'w-11 h-11 rounded-2xl'
              )}
            >
              <CalendarCheck className={compact ? 'w-4 h-4' : 'w-6 h-6'} />
            </span>
            <div className="min-w-0">
              <span
                className={cx(
                  'inline-block rounded-full font-black bg-white text-indigo-800 uppercase tracking-wider',
                  compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-0.5 text-[10px]'
                )}
              >
                Bugün yapılması gerekenler
              </span>
              <p className={cx('font-bold capitalize', compact ? 'text-[11px] mt-0.5' : 'text-sm mt-1')}>{dateText}</p>
            </div>
          </div>
          {todayItems.length > 0 && (
            <div className="text-right" id="student-today-count">
              <p className={cx('font-black leading-none tabular-nums', compact ? 'text-base' : 'text-2xl')}>
                {doneToday}/{todayItems.length}
              </p>
              <p className={cx('font-semibold text-indigo-100', compact ? 'text-[10px]' : 'text-[11px]')}>görev tamamlandı</p>
            </div>
          )}
        </div>

        {todayItems.length > 0 && (
          <div className="h-2 rounded-full bg-white/25 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.round((doneToday / todayItems.length) * 100)}%` }} />
          </div>
        )}

        {allDone && (
          <div id="student-today-alldone" className={cx('flex items-center gap-2 rounded-xl bg-white/20 font-bold', compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm')}>
            <PartyPopper className="w-4 h-4" /> Harika! Bugünkü görevlerin tamam.
          </div>
        )}

        {todayItems.length > 0 ? (
          <ul className={cx('space-y-2', compact && 'space-y-1.5 max-h-80 overflow-y-auto pr-0.5')} id="student-today-list">
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

        {info && (
          <p role="status" id="student-today-info" className="text-xs font-bold bg-emerald-500/80 rounded-lg px-3 py-2">
            {info}
          </p>
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
            {showWeek ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Bu haftanın planı ({weekRangeLabel(weekStart)})
          </button>
          {showWeek && (
            <div id="student-plan-week" className="mt-3 space-y-3">
              {PLAN_DAYS.map((_, d) => {
                const name = planDayName(weekStart, d);
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
