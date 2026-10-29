import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarCheck, Check, ChevronDown, ChevronUp, PartyPopper, AlertTriangle, ListChecks } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cx, IconBox } from '../ui/kit';
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
// Aşama 87: sistemin kart tasarımına uyumlu sade görünüm (mor degrade kaldırıldı). Bugünün görevleri öne
// çıkar; geçen günlerden kalanlar uyarı renginde ve gün etiketiyle; haftalık görünümde geçmiş günler soluk,
// bugün vurgulu. Hız: bulanık arka plan ve büyük gölge kaldırıldı, ilerleme çubuğu yalnızca transform ile çizilir.
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
    infoTimer.current = window.setTimeout(() => setInfo(null), 15000); // Aşama 99: 15 sn
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

  // Satırın türü: bugün / geçen günden kalan / haftalık görünümde geçmiş, bugün ya da gelecek gün
  type RowKind = 'today' | 'overdue' | 'past' | 'future';

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <IconBox icon={CalendarCheck} tone="brand" size="sm" />
        <div className="min-w-0">
          <p className={cx('font-semibold text-fg leading-tight', compact ? 'text-sm' : 'text-base')}>Bugün yapılması gerekenler</p>
          <p className="text-[11px] text-muted capitalize leading-tight mt-0.5">{dateText}</p>
        </div>
      </div>
      {todayItems.length > 0 && (
        <div className="text-right shrink-0" id="student-today-count">
          <p className={cx('font-bold leading-none tabular-nums', allDone ? 'text-success-fg' : 'text-fg', compact ? 'text-base' : 'text-xl')}>
            {doneToday}/{todayItems.length}
          </p>
          <p className="text-[10px] text-muted mt-0.5">görev tamamlandı</p>
        </div>
      )}
    </div>
  );

  // Plan hiç gönderilmemişse (ya da bu hafta görev yoksa): normal görünümde kart hiç görünmez,
  // küçük görünümde (ana sayfa yan paneli) yerleşim bozulmasın diye sade bir bilgi kartı gösterilir
  if (items.length === 0) {
    if (!compact) return null;
    return (
      <section id="student-today-plan" aria-label="Bugün yapılması gerekenler" className="rounded-xl border border-line bg-surface p-3 space-y-2">
        {header}
        <p className="text-xs text-muted" id="student-today-empty">
          Bu hafta için gönderilmiş çalışma planın yok.
        </p>
      </section>
    );
  }

  const smallBtn = 'inline-flex items-center justify-center h-7 w-20 rounded-md text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

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
          <label className="text-[11px] font-semibold text-fg-2" htmlFor={`share-${it.id}`}>
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
            className="w-16 h-7 min-h-0 rounded-md border border-line-strong bg-surface px-2 py-0 text-xs font-semibold text-fg tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            autoFocus
          />
          <button type="submit" disabled={editSaving} className={cx(smallBtn, 'bg-brand text-white hover:bg-brand-hover')}>
            {editSaving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button type="button" disabled={editSaving} onClick={() => setEditId(null)} className={cx(smallBtn, 'border border-line bg-surface text-fg hover:bg-surface-2')}>
            Vazgeç
          </button>
        </form>
      );
    }
    return (
      <div data-task-share className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-muted">
        <ListChecks className="w-3.5 h-3.5 shrink-0" />
        {share ? (
          <span data-task-share-count>
            Soru kaydında: <span className="font-semibold text-fg-2">{share.count} soru</span>
            {share.date !== ymd(new Date()) ? ` (${shortDayLabel(share.date)})` : ''}
          </span>
        ) : (
          <span>{busy ? 'Soru kaydına aktarılıyor…' : 'Soru kaydına aktarılmadı'}</span>
        )}
        {!busy && (
          <button type="button" data-task-share-btn data-yazma onClick={() => startEdit(it)} className="font-semibold text-brand-fg hover:underline underline-offset-2 cursor-pointer">
            {share ? 'Düzenle' : 'Soru kaydına ekle'}
          </button>
        )}
      </div>
    );
  };

  const renderRow = (it: PlanItem, kind: RowKind) => {
    const done = !!it.doneAt;
    const late = kind === 'overdue' || (kind === 'past' && !done);
    return (
      <li
        key={it.id}
        data-today-task={it.id}
        data-done={done ? '1' : '0'}
        data-kind={kind}
        className={cx(
          'flex items-start rounded-lg border transition-colors',
          compact ? 'gap-2 px-2 py-1.5' : 'gap-3 px-3 py-2.5',
          done
            ? 'bg-surface-2 border-line'
            : kind === 'today'
            ? 'bg-surface border-line hover:border-line-strong'
            : kind === 'overdue'
            ? 'bg-surface border-warning/30'
            : kind === 'past'
            ? 'bg-surface-2 border-line'
            : 'bg-surface border-dashed border-line-strong'
        )}
      >
        <button
          type="button"
          data-task-toggle
          data-yazma
          aria-pressed={done}
          aria-label={done ? 'Yapıldı işaretini kaldır' : 'Yaptım olarak işaretle'}
          onClick={() => toggle(it)}
          className={cx(
            'mt-0.5 shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors',
            compact ? 'w-6 h-6' : 'w-7 h-7',
            done
              ? 'bg-success border-success text-white'
              : late
              ? 'border-warning text-transparent hover:bg-warning-soft hover:text-warning-fg'
              : 'border-line-strong text-transparent hover:border-brand hover:bg-brand-soft hover:text-brand-fg'
          )}
        >
          <Check className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} strokeWidth={3} />
        </button>
        <div className={cx('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
          <div className={cx(compact ? 'space-y-0.5' : 'space-y-1', (done || kind === 'past') && 'opacity-75')}>
            <div className="flex flex-wrap items-center gap-1.5">
              {kind === 'overdue' && (
                <span className="ui-chip ui-chip-warning !text-[10px] !leading-4" data-task-day>
                  {shortDayLabel(dateOfDay(weekStart, it.day))}
                </span>
              )}
              <span className="ui-chip ui-chip-neutral !text-[10px] !leading-4">{it.subject}</span>
              {it.book && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                  <BookOpen className="w-3 h-3" /> {it.book}
                </span>
              )}
              {it.questionCount > 0 && (
                <span className="ui-chip ui-chip-brand !text-[10px] !leading-4" data-task-qcount>
                  {it.questionCount} soru
                </span>
              )}
            </div>
            {it.note && (
              <p className={cx('whitespace-pre-wrap break-words', compact ? 'text-xs' : 'text-sm', done ? 'line-through text-muted' : 'text-fg font-medium')}>{it.note}</p>
            )}
          </div>
          {done && it.questionCount > 0 && renderShare(it)}
        </div>
      </li>
    );
  };

  const pct = todayItems.length ? doneToday / todayItems.length : 0;

  return (
    <section
      id="student-today-plan"
      aria-label="Bugün yapılması gerekenler"
      className={cx('rounded-xl border border-line bg-surface', compact ? 'p-3 space-y-2.5' : 'p-4 sm:p-5 space-y-3 shadow-sm')}
    >
      {header}

      {todayItems.length > 0 && (
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
          <div
            className={cx('h-full w-full rounded-full origin-left transition-transform duration-500', allDone ? 'bg-success' : 'bg-brand')}
            style={{ transform: `scaleX(${pct})` }}
          />
        </div>
      )}

      {allDone && (
        <div id="student-today-alldone" className="flex items-center gap-1.5 rounded-lg bg-success-soft text-success-fg px-2.5 py-1.5 text-xs font-semibold">
          <PartyPopper className="w-4 h-4 shrink-0" /> Harika! Bugünkü görevlerin tamam.
        </div>
      )}

      {todayItems.length > 0 ? (
        <ul className={cx('space-y-1.5', compact && 'max-h-80 overflow-y-auto pr-0.5')} id="student-today-list">
          {todayItems.map((it) => renderRow(it, 'today'))}
        </ul>
      ) : (
        <p className="text-xs text-muted" id="student-today-empty">
          Bugün için planlanmış görevin yok.
        </p>
      )}

      {overdue.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft/50 p-2 space-y-1.5" id="student-today-overdue">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-fg">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Geçen günlerden kalan {overdue.length} görev
          </p>
          <ul className="space-y-1.5">{overdue.map((it) => renderRow(it, 'overdue'))}</ul>
        </div>
      )}

      {info && (
        <p role="status" id="student-today-info" className="text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-success-soft text-success-fg">
          {info}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-danger-soft text-danger-fg">
          {error}
        </p>
      )}

      <div className="pt-0.5">
        <button
          type="button"
          id="student-plan-week-toggle"
          aria-expanded={showWeek}
          onClick={() => setShowWeek((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-fg hover:underline underline-offset-2 cursor-pointer"
        >
          {showWeek ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Bu haftanın planı ({weekRangeLabel(weekStart)})
        </button>
        {showWeek && (
          <div id="student-plan-week" className="mt-2.5 space-y-2.5">
            {PLAN_DAYS.map((_, d) => {
              const list = items.filter((i) => i.day === d);
              if (!list.length) return null;
              const name = planDayName(weekStart, d);
              const date = dateOfDay(weekStart, d);
              const kind: RowKind = date === todayStr ? 'today' : date < todayStr ? 'past' : 'future';
              const dayDone = list.filter((i) => i.doneAt).length;
              return (
                <div key={d} data-week-day={d} data-day-kind={kind} className={cx(kind === 'today' && 'rounded-lg border border-brand/25 bg-brand-soft/40 p-2')}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className={cx('text-[11px] font-semibold uppercase tracking-wide', kind === 'today' ? 'text-brand-fg' : kind === 'past' ? 'text-muted' : 'text-fg-2')}>
                      {name} · {shortDayLabel(date)}
                    </p>
                    <span
                      className={cx(
                        'ui-chip !text-[10px] !leading-4',
                        kind === 'today' ? 'ui-chip-brand' : dayDone === list.length ? 'ui-chip-success' : kind === 'past' ? 'ui-chip-warning' : 'ui-chip-neutral'
                      )}
                    >
                      {kind === 'today' ? 'Bugün' : kind === 'past' ? (dayDone === list.length ? 'Tamamlandı' : 'Geçti') : 'Sıradaki'} · {dayDone}/{list.length}
                    </span>
                  </div>
                  <ul className="space-y-1.5">{list.map((it) => renderRow(it, kind))}</ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {sentBy && <p className="text-[11px] text-muted">Planı hazırlayan: {sentBy}</p>}
    </section>
  );
};
