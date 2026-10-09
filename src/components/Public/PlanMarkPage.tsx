import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, CalendarCheck, Check, CheckCircle2 } from 'lucide-react';
import { cx } from '../ui/kit';

// ============================================================================
// GİRİŞSİZ HAFTALIK PLAN İŞARETLEME (Aşama 22)
// Öğrenci, e-postadaki kişisel bağlantıyla bu sayfayı açar ve görevlerini "yaptım" diye işaretler.
// Her işaret anında sunucuya kaydedilir; öğretmen uygulamada ve son akşamki raporda görür.
// Bağlantı yalnızca o öğrencinin o haftaki planını açar; sunucu her istekte imzayı denetler.
// ============================================================================

// Gün adı gerçek tarihten hesaplanır (plan Pazartesi dışında bir günde de başlayabilir)
const JS_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dayNameOf = (ymd: string, fallbackDay: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? JS_DAYS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : JS_DAYS[(fallbackDay + 1) % 7];
};

interface PlanData {
  studentName: string;
  className: string;
  weekStart: string;
  weekLabel: string;
  teacherName: string;
  today: string;
  items: Array<{ id: string; day: number; date: string; subject: string; book: string; note: string; doneAt: string | null }>;
}

async function call(action: 'plan-get' | 'plan-mark', payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch('/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
  } catch {
    throw new Error('İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'Sunucuya ulaşılamadı. Biraz sonra tekrar dene.');
  return data;
}

const shortDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : ymd;
};

export const PlanMarkPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const pending = useRef(new Set<string>());
  const [, force] = useState(0);

  useEffect(() => {
    document.title = 'Haftalık Planım';
    call('plan-get', { token })
      .then((d: PlanData) => setData(d))
      .catch((e) => setError(e.message));
  }, [token]);

  const days = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 7 }, (_, d) => {
      const list = data.items.filter((i) => i.day === d);
      return { name: dayNameOf(list[0]?.date || '', d), d, list };
    }).filter((x) => x.list.length);
  }, [data]);
  const done = data ? data.items.filter((i) => i.doneAt).length : 0;
  const total = data ? data.items.length : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = async (id: string) => {
    if (!data || pending.current.has(id)) return;
    const it = data.items.find((i) => i.id === id);
    if (!it) return;
    const next = !it.doneAt;
    pending.current.add(id);
    force((n) => n + 1);
    setMarkError(null);
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, doneAt: next ? new Date().toISOString() : null } : i)) } : d));
    try {
      const r = await call('plan-mark', { token, itemId: id, done: next });
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, doneAt: r.doneAt } : i)) } : d));
    } catch (e: any) {
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, doneAt: it.doneAt } : i)) } : d));
      setMarkError(e.message);
    } finally {
      pending.current.delete(id);
      force((n) => n + 1);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-fg" id="plan-mark-page">
      <header className="bg-surface border-b border-line">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-fg">Haftalık Çalışma Planım</h1>
            <p className="text-xs text-muted truncate">
              {data ? `${data.studentName}${data.className ? ` · ${data.className}` : ''} · ${data.weekLabel}` : 'Eğitim Takip'}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-16 space-y-4">
        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
            <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
            Plan yükleniyor…
          </div>
        )}
        {error && (
          <div role="alert" id="plan-mark-error" className="ui-card p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger-fg shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-fg">Plan açılamadı</p>
              <p className="text-sm text-muted mt-1">{error}</p>
            </div>
          </div>
        )}
        {data && (
          <>
            <section className="ui-card p-4 space-y-2" id="plan-mark-summary">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-fg-2">
                  Görevlerini yaptıkça yanındaki daireye dokun. İşaretlerin hemen kaydedilir{data.teacherName ? ` ve ${data.teacherName} öğretmenin görür` : ''}.
                </p>
                <p className="text-right shrink-0">
                  <span className="block text-2xl font-black tabular-nums" id="plan-mark-count">
                    {done}/{total}
                  </span>
                  <span className="text-[11px] text-muted">görev</span>
                </p>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
                <div className={cx('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
              </div>
              {pct === 100 && (
                <p className="text-sm font-bold text-success-fg flex items-center gap-1.5" id="plan-mark-alldone">
                  <CheckCircle2 className="w-4 h-4" /> Harika! Bu haftanın bütün görevlerini tamamladın.
                </p>
              )}
            </section>
            {markError && (
              <p role="alert" className="text-xs font-bold text-danger-fg bg-danger-soft rounded-lg px-3 py-2">
                {markError}
              </p>
            )}
            {days.map((x) => {
              const date = x.list[0]?.date || '';
              const isToday = date === data.today;
              const dDone = x.list.filter((i) => i.doneAt).length;
              return (
                <section key={x.d} className={cx('ui-card overflow-hidden', isToday && 'ring-2 ring-brand/40')} data-plan-day={x.d}>
                  <div className={cx('flex items-center justify-between px-4 py-2.5 border-b border-line', isToday ? 'bg-brand-soft/60' : 'bg-surface-2/60')}>
                    <p className="text-sm font-bold text-fg">
                      {x.name} <span className="font-medium text-muted">· {shortDate(date)}</span>
                      {isToday && <span className="ml-2 text-[10px] font-black uppercase tracking-wide text-brand-fg">Bugün</span>}
                    </p>
                    <span className="text-xs font-semibold text-muted tabular-nums">
                      {dDone}/{x.list.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-line">
                    {x.list.map((i) => {
                      const isDone = !!i.doneAt;
                      return (
                        <li key={i.id} className="flex items-start gap-3 px-4 py-3" data-mark-item={i.id} data-done={isDone ? '1' : '0'}>
                          <button
                            type="button"
                            data-mark-toggle
                            aria-pressed={isDone}
                            aria-label={isDone ? 'Yaptım işaretini kaldır' : 'Yaptım olarak işaretle'}
                            disabled={pending.current.has(i.id)}
                            onClick={() => toggle(i.id)}
                            className={cx(
                              'mt-0.5 w-9 h-9 shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all active:scale-90',
                              isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-line-strong text-transparent hover:border-emerald-400'
                            )}
                          >
                            <Check className="w-5 h-5" strokeWidth={3} />
                          </button>
                          <div className={cx('min-w-0 flex-1 space-y-0.5', isDone && 'opacity-70')}>
                            <p className="text-sm font-bold text-fg">{i.subject}</p>
                            {i.book && (
                              <p className="text-xs text-muted flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5" /> {i.book}
                              </p>
                            )}
                            {i.note && <p className={cx('text-sm text-fg-2 whitespace-pre-wrap break-words', isDone && 'line-through')}>{i.note}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <p className="text-[11px] text-muted text-center">Bu bağlantı sana özeldir; başkasıyla paylaşma. Uygulamaya girerek de işaretleyebilirsin.</p>
          </>
        )}
      </main>
    </div>
  );
};
