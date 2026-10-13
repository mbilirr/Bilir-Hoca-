import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Target, Check, StickyNote, Pencil, X } from 'lucide-react';
import type { WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { normalizeSubject, targetSubjectList } from '../../lib/subjects';
import { formatDateISO } from '../../utils/questionAnalytics';
import { computeTargetDays, isFlexibleTarget, weekDayGoal, type TargetDayRow, type TargetDaysResult } from '../../utils/targetDays';
import { cx } from '../ui/kit';
import { loadSentPlanItemsInRange, type DatedPlanItem } from '../../services/studyPlanService';

// ============================================================================
// SORU HEDEFLERİ — TEK TABLO (Aşama 30)
//
// Önceden her hedef ayrı bir kartta, her kartın içinde ayrı bir "gün gün durum" tablosuyla
// gösteriliyordu; birden çok öğretmen/ders hedefi olunca ekranda 3-4 tablo oluşuyordu.
// Bu tabloda bu haftaya denk gelen BÜTÜN hedefler (öğrenci + sınıf hedefleri) tek yerde:
//   satır  = hedef (Genel / Matematik / Geometri ...)
//   sütun  = haftanın günleri + dönem toplamı + durum
//   altta  = "Günün hedefi" ve "Çözülen (tüm dersler)" satırları
// Hesap, grafik / öğrenci ekranı / ana sayfa / PDF ile AYNI fonksiyonlardan gelir
// (computeTargetDays + weekDayGoal), bu yüzden sayılar her yerde birebir aynıdır.
// ============================================================================

const GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const parseYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const shortDate = (s: string) => {
  const d = parseYmd(s);
  return d ? `${d.getDate()} ${AY[d.getMonth()]}` : s;
};

const ownerName = (t: WeeklyQuestionTarget) =>
  t.assignedByTeacherName || (t.assignedBy && t.assignedBy !== 'Öğretmen' ? t.assignedBy : 'Öğretmen');

const subjectSplit = (t: WeeklyQuestionTarget): Array<[string, number]> => {
  if (targetSubjectList(t.subject).length === 1) return [];
  const st = t.subjectTargets;
  if (!st) return [];
  const list: Array<[string, number]> = Array.isArray(st)
    ? st.filter((x) => x && x.subject).map((x) => [normalizeSubject(x.subject), Number(x.target) || 0])
    : Object.entries(st).map(([k, v]) => [normalizeSubject(k), Number(v) || 0]);
  return list.filter(([, n]) => n > 0);
};

// Hücre renkleri: tamam = yeşil, eksik = turuncu, hiç girilmedi = kırmızı, bugün = mavi, gelecek = gri
const CELL: Record<TargetDayRow['status'], string> = {
  met: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200',
  partial: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200',
  none: 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200',
  today: 'bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200',
  future: 'text-muted',
};

export const TargetSummaryTable: React.FC<{
  targets: WeeklyQuestionTarget[];
  studentId: string;
  logs: StudentQuestionLog[];
  /** Gösterilen haftanın Pazartesi günü (YYYY-MM-DD) */
  weekStart: string;
  /** Öğretmen ekranı: hedef satırına "düzenle" düğmesi */
  onEditTarget?: (t: WeeklyQuestionTarget) => void;
  id?: string;
}> = ({ targets, studentId, logs, weekStart, onEditTarget, id = 'target-summary-table' }) => {
  const today = formatDateISO(new Date());

  const days = useMemo(() => {
    const start = parseYmd(weekStart);
    if (!start) return [] as string[];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return formatDateISO(d);
    });
  }, [weekStart]);

  const rows = useMemo(
    () => targets.map((t) => ({ t, res: computeTargetDays(t, studentId, logs, today) as TargetDaysResult })),
    [targets, studentId, logs, today]
  );

  // Tüm derslerde günlük çözülen soru (grafikteki çubukla aynı)
  const solvedByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      if (l.studentId !== studentId) continue;
      const d = (l.date || '').slice(0, 10);
      m.set(d, (m.get(d) || 0) + (Number(l.totalQuestions) || 0));
    }
    return m;
  }, [logs, studentId]);

  // Aşama 31: bu haftaya düşen, öğrenciye GÖNDERİLMİŞ plan görevleri ("Çözülen" satırındaki özet kartı için)
  const [planItems, setPlanItems] = useState<DatedPlanItem[]>([]);
  const rangeFrom = days[0] || '';
  const rangeTo = days[6] || '';
  useEffect(() => {
    let cancelled = false;
    setPlanItems([]);
    if (!studentId || !rangeFrom || !rangeTo) return;
    loadSentPlanItemsInRange(studentId, rangeFrom, rangeTo)
      .then((items) => {
        if (!cancelled) setPlanItems(items);
      })
      .catch(() => {
        /* plan okunamazsa kart yalnızca çözülen dersleri gösterir */
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, rangeFrom, rangeTo]);

  // Gün → ders → çözülen soru (ders girilmemiş eski kayıtlar "belirsiz" sayılır)
  const solvedBySubjectDay = useMemo(() => {
    const m = new Map<string, { bySubject: Map<string, number>; unknown: number }>();
    for (const l of logs) {
      if (l.studentId !== studentId) continue;
      const d = (l.date || '').slice(0, 10);
      const rec = m.get(d) || { bySubject: new Map<string, number>(), unknown: 0 };
      const entries = Array.isArray(l.entries) ? l.entries : [];
      if (entries.length) {
        for (const e of entries) {
          const n = Number(e.questionCount) || 0;
          if (n <= 0) continue;
          const subj = normalizeSubject(e.subject || '');
          rec.bySubject.set(subj, (rec.bySubject.get(subj) || 0) + n);
        }
      } else {
        rec.unknown += Number(l.totalQuestions) || 0;
      }
      m.set(d, rec);
    }
    return m;
  }, [logs, studentId]);

  /**
   * "Çözülen" hücresinin özet kartı (Aşama 31b): yalnızca renkli yazılar —
   * planda olup o dersten soru çözüldüyse YEŞİL ✓, çözülmediyse KIRMIZI ✗, plan dışı çözülen ders SİYAH.
   * "çözüldü / çözülmedi" gibi açıklama yazılmaz; soru çözüldüyse yanına sayısı yazılır (çözülmediyse sıfır yazılmaz).
   */
  const daySummary = (d: string) => {
    const rec = solvedBySubjectDay.get(d);
    const plan = planItems.filter((it) => it.date === d);
    const planSubjects = new Set(plan.map((it) => normalizeSubject(it.subject)));
    const offPlan = rec ? Array.from(rec.bySubject.keys()).filter((s) => s && !planSubjects.has(s)) : [];
    const dayIdx = days.indexOf(d);
    return (
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-muted pb-1 border-b border-line">
          {GUN[dayIdx] || ''} {shortDate(d)}
        </div>
        {plan.length === 0 && offPlan.length === 0 ? (
          <p className="text-muted">Plan yok</p>
        ) : (
          <ul className="space-y-0.5 leading-snug">
            {plan.map((it) => {
              const count = rec?.bySubject.get(normalizeSubject(it.subject)) || 0;
              const solved = count > 0;
              const task = planTaskShort(it);
              return (
                <li
                  key={it.id}
                  className={cx('flex items-start gap-1.5 font-semibold', solved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}
                >
                  {solved ? <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> : <X className="w-3.5 h-3.5 shrink-0 mt-px" />}
                  <span className="min-w-0">
                    {normalizeSubject(it.subject)}
                    {task ? ` – ${task}` : ''}
                    {solved && <span className="ml-1 font-black tabular-nums">· {count}</span>}
                  </span>
                </li>
              );
            })}
            {offPlan.map((s) => (
              <li key={`x-${s}`} className="font-semibold text-fg pl-5">
                {s}
                <span className="ml-1 font-black tabular-nums">· {rec?.bySubject.get(s) || 0}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  if (!targets.length) return null;

  const weekSolved = days.reduce((s, d) => s + (solvedByDay.get(d) || 0), 0);
  const weekGoal = days.reduce((s, d) => s + weekDayGoal(d, rows).goal, 0);

  return (
    <section className="ui-card overflow-hidden" id={id} aria-labelledby={`${id}-title`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-warning-soft text-warning-fg flex items-center justify-center shrink-0">
            <Target className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 id={`${id}-title`} className="text-base font-semibold text-fg">
              Soru hedefleri
            </h3>
            <p className="text-xs text-muted">
              {targets.length} hedef · {shortDate(days[0] || '')} – {shortDate(days[6] || '')} haftası · bu hafta {weekSolved} soru
              {weekGoal > 0 ? ` / ${weekGoal} hedef` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Renk açıklaması">
          <Legend cls="bg-emerald-500" text="Tamam" />
          <Legend cls="bg-amber-500" text="Eksik" />
          <Legend cls="bg-rose-500" text="Girilmedi" />
          <Legend cls="bg-sky-500" text="Bugün" />
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-surface-2 text-fg-2">
              <th scope="col" className="sticky left-0 z-10 bg-surface-2 text-left font-semibold px-3 py-2.5 min-w-[220px]">
                Hedef
              </th>
              {days.map((d, i) => (
                <th
                  key={d}
                  scope="col"
                  className={cx('font-semibold px-1.5 py-2.5 text-center whitespace-nowrap', d === today && 'text-sky-700 dark:text-sky-300')}
                >
                  <span className="block">{GUN[i]}</span>
                  <span className="block text-[10px] font-normal text-muted">{shortDate(d)}</span>
                </th>
              ))}
              <th scope="col" className="font-semibold px-3 py-2.5 text-center whitespace-nowrap">
                Dönem toplamı
              </th>
              <th scope="col" className="font-semibold px-3 py-2.5 text-center">
                Durum
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ t, res }) => {
              const done = res.solved >= res.total;
              const remaining = Math.max(0, res.total - res.solved);
              const split = subjectSplit(t);
              const bySubject = split.length ? dataService.questionTargetProgress(t, studentId, logs).bySubject : {};
              return (
                <tr key={t.id || `${t.subject}-${t.weekStartDate}`} data-testid="target-summary-row" className="hover:bg-surface-2/60">
                  <th scope="row" className="sticky left-0 z-10 bg-surface text-left font-normal px-3 py-2.5 align-top">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-fg text-[13px] leading-tight">
                          {t.subject ? t.subject : 'Genel hedef'}
                          <span className="font-semibold text-muted"> · {res.total} soru</span>
                        </div>
                        <div className="text-[11px] text-muted mt-0.5 leading-snug">
                          {shortDate(res.start)} – {shortDate(res.end)} · {ownerName(t)}
                          {t.targetType === 'class' ? ' · Sınıf hedefi' : ''}
                          {isFlexibleTarget(t) ? ' · günlere farklı dağıtıldı' : ` · günde ${res.daily}`}
                        </div>
                        {split.length > 0 && (
                          <div className="text-[11px] text-fg-2 mt-1 flex flex-wrap gap-x-2">
                            {split.map(([s, n]) => (
                              <span key={s} className={cx((bySubject[s] || 0) >= n && 'text-emerald-700 dark:text-emerald-300 font-semibold')}>
                                {s} {bySubject[s] || 0}/{n}
                              </span>
                            ))}
                          </div>
                        )}
                        {t.notes && (
                          <div className="text-[11px] text-fg-2 mt-1 flex items-start gap-1" title="Öğretmenin notu">
                            <StickyNote className="w-3 h-3 mt-0.5 shrink-0 text-warning-fg" />
                            <span className="line-clamp-2">{t.notes}</span>
                          </div>
                        )}
                      </div>
                      {onEditTarget && dataService.canEditQuestionTarget(t) && (
                        <button
                          type="button"
                          onClick={() => onEditTarget(t)}
                          className="ui-btn ui-btn-ghost ui-btn-icon shrink-0 -mr-1"
                          title="Hedefi düzenle"
                          aria-label="Hedefi düzenle"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                  {days.map((d) => {
                    const r = res.rows.find((x) => x.ymd === d);
                    if (!r) {
                      return (
                        <td key={d} className="px-1.5 py-2.5 text-center text-subtle" title="Bu gün hedefin tarihleri dışında">
                          ·
                        </td>
                      );
                    }
                    if (r.target <= 0) {
                      return (
                        <td key={d} className="px-1.5 py-2.5 text-center text-muted" title="Bu gün hedef yok">
                          {r.solved > 0 ? r.solved : '—'}
                        </td>
                      );
                    }
                    return (
                      <td key={d} className="px-1 py-1.5 text-center">
                        <span
                          className={cx('inline-flex flex-col items-center justify-center rounded-lg px-1.5 py-1 min-w-[3.25rem] tabular-nums', CELL[r.status])}
                          title={`${r.solved} / ${r.target} soru`}
                        >
                          <span className="font-bold leading-none">
                            {r.status === 'future' ? '—' : r.solved}
                            {r.status === 'met' && <Check className="inline w-3 h-3 ml-0.5 -mt-0.5" />}
                          </span>
                          <span className="text-[10px] opacity-80 leading-none mt-0.5">/ {r.target}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center align-middle min-w-[120px]">
                    <div className="font-bold text-fg tabular-nums">
                      {res.solved} / {res.total}
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
                      <div className={cx('h-full rounded-full', done ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${res.percent}%` }} />
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">%{res.percent}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                    {done ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-success text-white">
                        <Check className="w-3.5 h-3.5" /> Tamamlandı
                      </span>
                    ) : (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold bg-warning-soft text-warning-fg">{remaining} soru kaldı</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-line-strong bg-surface-2/70">
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-surface-2 text-left font-semibold text-fg-2 px-3 py-2">
                Günün hedefi
                <span className="block text-[10px] font-normal text-muted">genel hedef; yoksa ders hedeflerinin toplamı</span>
              </th>
              {days.map((d) => {
                const g = weekDayGoal(d, rows).goal;
                return (
                  <td key={d} className="px-1.5 py-2 text-center font-semibold text-fg-2 tabular-nums">
                    {g > 0 ? g : '—'}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-center font-semibold text-fg-2 tabular-nums">{weekGoal > 0 ? weekGoal : '—'}</td>
              <td />
            </tr>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-surface-2 text-left font-semibold text-fg px-3 py-2">
                Çözülen (tüm dersler)
              </th>
              {days.map((d) => {
                const g = weekDayGoal(d, rows).goal;
                const n = solvedByDay.get(d) || 0;
                const future = d > today;
                return (
                  <td
                    key={d}
                    className={cx(
                      'px-1.5 py-2 text-center font-bold tabular-nums',
                      future ? 'text-muted' : g > 0 && n >= g ? 'text-emerald-700 dark:text-emerald-300' : g > 0 && d < today ? 'text-rose-700 dark:text-rose-300' : 'text-fg'
                    )}
                  >
                    {future && n === 0 && !planItems.some((it) => it.date === d) ? (
                      '—'
                    ) : (
                      <GhostTip label={`${shortDate(d)} özeti: ${n} soru`} content={() => daySummary(d)}>
                        {future && n === 0 ? '—' : n}
                      </GhostTip>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-center font-bold text-fg tabular-nums">{weekSolved}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 sm:px-5 py-2 text-[11px] text-muted border-t border-line">
        Hücrelerde <strong className="text-fg-2">çözülen / o günün hedefi</strong> yazar. Ders hedeflerinde yalnızca o dersin soruları sayılır.
        "Dönem toplamı" hedefin tüm tarihlerini kapsar. "Çözülen" satırındaki sayının üzerine gelin (telefonda dokunun):
        plandaki dersler <span className="text-emerald-600 dark:text-emerald-400 font-semibold">yeşil</span> (çözüldü) ya da{' '}
        <span className="text-rose-600 dark:text-rose-400 font-semibold">kırmızı</span> (çözülmedi), plan dışı çözülen dersler siyah görünür.
      </p>
    </section>
  );
};

const Legend: React.FC<{ cls: string; text: string }> = ({ cls, text }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cx('w-2.5 h-2.5 rounded-sm', cls)} />
    {text}
  </span>
);

/** Plan görevinin kısa yazısı: "Orjinal – Sayfa 100-110" (açıklamanın ilk satırı, en çok 60 karakter) */
const planTaskShort = (it: { book: string; note: string }) => {
  const note = (it.note || '').split('\n')[0];
  const text = [it.book, note]
    .map((x) => (x || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' – ');
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};

// ---------------------------------------------------------------------------
// Hayalet özet kartı (Aşama 31): fare üzerine gelince (telefonda dokununca) yarı saydam küçük kart açılır.
// Kart sayfanın en üstünde (portal) çizilir; tablo kaydırma kutusunun içinde kesilmez.
// ---------------------------------------------------------------------------
const GHOST_HALF_WIDTH = 170;

const GhostTip: React.FC<{ label: string; content: () => React.ReactNode; children: React.ReactNode }> = ({ label, content, children }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 260; // üstte yer yoksa altta aç
    const x = Math.min(Math.max(r.left + r.width / 2, GHOST_HALF_WIDTH + 8), window.innerWidth - GHOST_HALF_WIDTH - 8);
    setPos({ x, y: below ? r.bottom + 8 : r.top - 8, below });
  };
  const hide = () => setPos(null);

  // Sayfa kaydırılınca / boyut değişince kart kapanır (yanlış yerde asılı kalmasın)
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos]);

  return (
    <span
      ref={ref}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-expanded={!!pos}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') show();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') hide();
      }}
      onFocus={show}
      onBlur={hide}
      onClick={() => (pos ? hide() : show())}
      className="cursor-help underline decoration-dotted decoration-2 underline-offset-4 rounded px-1 outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', left: pos.x, top: pos.y, transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}
            className="z-[90] pointer-events-none w-[21rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface/90 backdrop-blur-md shadow-pop p-3 text-xs text-left font-normal"
          >
            {content()}
          </div>,
          document.body
        )}
    </span>
  );
};
