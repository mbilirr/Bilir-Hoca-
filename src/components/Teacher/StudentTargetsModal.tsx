import React, { useState, useMemo } from 'react';
import { User, Search, Plus, Target, ChevronDown, BarChart3 } from 'lucide-react';
import type { Student, ClassGroup, WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, Segmented, EmptyState } from '../ui/kit';
import { inputCls, localDateStr } from './FormParts';
import { targetForDay, isPlanMirrorTarget } from '../../utils/targetDays';
import { PERIOD_ITEMS, TargetPeriodFilter, periodOf, targetPeriodText, ownerText, ProgressBar, TargetRowActions } from './TargetListParts';

// Öğrenci soru hedefleri listesi (Aşama 10)
interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  classes: ClassGroup[];
  allLogs: StudentQuestionLog[];
  onEdit: (target: WeeklyQuestionTarget) => void;
  onNew: () => void;
  onSelectStudentToAnalyze: (studentId: string) => void;
}

export const StudentTargetsModal: React.FC<Props> = ({ isOpen, onClose, students, classes, allLogs, onEdit, onNew, onSelectStudentToAnalyze }) => {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  // Aşama 53: 'plan' = "Gelecek hafta planı" (haftalık plandan otomatik açılan, bugünden sonra başlayan hedefler)
  const [period, setPeriod] = useState<TargetPeriodFilter | 'plan'>('active');
  const [onlyMine, setOnlyMine] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  // Aşama 66: hafta satırında ders ders hedefleri açılan öğrenci + hafta
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Aşama 15: kayıtlar öğrenciye göre bir kez gruplanır (her hedef için tüm kayıtlar taranmaz)
  const byStudent = useMemo(() => {
    const m = new Map<string, StudentQuestionLog[]>();
    if (!isOpen) return m;
    for (const l of allLogs) {
      let a = m.get(l.studentId);
      if (!a) m.set(l.studentId, (a = []));
      a.push(l);
    }
    return m;
  }, [allLogs, isOpen]);
  if (!isOpen) return null;

  const today = localDateStr(new Date());
  const all = dataService.getStudentQuestionTargets();
  const q = query.toLocaleLowerCase('tr-TR').trim();
  const isNextPlan = (t: WeeklyQuestionTarget) => !!t.fromPlan && (Number(t.targetQuestions) || 0) >= 1 && (t.weekStartDate || '') > today;
  const rows = all
    .map((t) => {
      const st = students.find((s) => s.id === t.studentId);
      const name = st?.name || t.studentName || 'Öğrenci';
      const className = st?.className || t.className || classes.find((c) => c.id === (st?.classId || t.classId))?.name || '';
      return { t, st, name, className, classId: st?.classId || t.classId, p: dataService.questionTargetProgress(t, t.studentId || '', byStudent.get(t.studentId || '') || []) };
    })
    .filter((r) => (period === 'plan' ? isNextPlan(r.t) : period === 'all' || periodOf(r.t, today) === period))
    .filter((r) => classFilter === 'all' || r.classId === classFilter)
    .filter((r) => !onlyMine || dataService.isMyQuestionTarget(r.t))
    .filter((r) => !q || r.name.toLocaleLowerCase('tr-TR').includes(q) || r.className.toLocaleLowerCase('tr-TR').includes(q))
    .sort((a, b) => (b.t.weekStartDate || '').localeCompare(a.t.weekStartDate || '') || a.name.localeCompare(b.name, 'tr'));
  const studentCount = new Set(rows.map((r) => r.t.studentId)).size;
  const nextPlanCount = all.filter(isNextPlan).length;
  const periodItems: Array<{ value: TargetPeriodFilter | 'plan'; label: string; id: string }> = [
    ...PERIOD_ITEMS.slice(0, 1),
    { value: 'plan', label: `Gelecek hafta planı${nextPlanCount ? ` (${nextPlanCount})` : ''}`, id: 'qt-filter-plan' },
    ...PERIOD_ITEMS.slice(1),
  ];
  // "Gelecek hafta planı" görünümünde hedefler öğrenci + hafta başına tek kartta toplanır
  const planGroups = (() => {
    if (period !== 'plan') return [];
    const m = new Map<string, { key: string; name: string; className: string; start: string; list: typeof rows }>();
    for (const r of rows) {
      const k = `${r.t.studentId}|${r.t.weekStartDate}`;
      if (!m.has(k)) m.set(k, { key: k, name: r.name, className: r.className, start: r.t.weekStartDate || '', list: [] });
      m.get(k)!.list.push(r);
    }
    return Array.from(m.values()).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'tr'));
  })();
  // Aşama 66: öğrencinin aynı haftaya ait bütün hedefleri (ders ders) TEK SATIRDA özetlenir
  const weekGroups = (() => {
    const m = new Map<string, { key: string; studentId: string; name: string; className: string; start: string; list: typeof rows }>();
    for (const r of rows) {
      const k = `${r.t.studentId}|${r.t.weekStartDate}`;
      if (!m.has(k)) m.set(k, { key: k, studentId: r.t.studentId || '', name: r.name, className: r.className, start: r.t.weekStartDate || '', list: [] });
      m.get(k)!.list.push(r);
    }
    return Array.from(m.values()).map((g) => {
      const targets = g.list.map((x) => x.t);
      // plan toplamı olan genel hedef ayrıca sayılmaz (çift sayılmasın)
      const counted = g.list.filter((x) => !isPlanMirrorTarget(x.t, targets));
      const total = counted.reduce((a, x) => a + (x.p.total || 0), 0);
      const solved = counted.reduce((a, x) => a + Math.min(x.p.solved || 0, x.p.total || 0), 0);
      const percent = total ? Math.min(100, Math.round((solved / total) * 100)) : 0;
      const owners = Array.from(new Set(g.list.map((x) => ownerText(x.t))));
      const end = g.list.reduce((a, x) => (dataService.questionTargetEnd(x.t) > a ? dataService.questionTargetEnd(x.t) : a), '');
      return { ...g, counted, total, solved, percent, done: total > 0 && solved >= total, owners, end };
    });
  })();
  const GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const weekDatesOf = (start: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (!m) return [] as string[];
    return Array.from({ length: 7 }, (_, i) => localDateStr(new Date(+m[1], +m[2] - 1, +m[3] + i)));
  };

  return (
    <Modal
      open
      id="student-targets-modal"
      onClose={onClose}
      icon={User}
      tone="warning"
      size="lg"
      title="Öğrenci Soru Hedefleri"
      description={period === 'plan' ? `${rows.length} hedef · ${studentCount} öğrenci` : `${weekGroups.length} haftalık hedef · ${studentCount} öğrenci`}
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Öğrenci adı veya sınıf ara…" className={`${inputCls} pl-9`} />
          </div>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={`${inputCls} sm:w-44`} aria-label="Sınıf">
            <option value="all">Tüm sınıflar</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {dataService.canGiveTargets() && (
          <button
            type="button"
            id="btn-new-student-target"
            onClick={() => {
              onClose();
              onNew();
            }}
            className="ui-btn ui-btn-primary shrink-0"
          >
            <Plus className="w-4 h-4" /> Yeni Hedef
          </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<TargetPeriodFilter | 'plan'> size="sm" value={period} onChange={setPeriod} items={periodItems} />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-fg-2 cursor-pointer">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand)]" />
            Yalnızca benim verdiklerim
          </label>
        </div>

        {period === 'plan' ? (
          planGroups.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Gelecek hafta planı yok"
              description="Haftalık planda gelecek haftaya soru sayılı görev verip planı öğrenciye gönderdiğinizde gün gün soru hedefi burada kendiliğinden açılır."
            />
          ) : (
            <div className="space-y-3" id="next-plan-targets">
              <p className="text-[11px] text-muted">
                Bu hedefler haftalık plandaki gün gün soru sayılarından otomatik açıldı. Bir dersin sayılarını değiştirmek için kalem düğmesine basın;
                değiştirdiğiniz sayılar plan güncellense de korunur.
              </p>
              {planGroups.map((g) => {
                const dates = weekDatesOf(g.start);
                return (
                  <div key={g.key} className="rounded-xl border border-brand/25 bg-brand-soft/20 p-3 space-y-2" data-testid="next-plan-group">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg">{g.name}</span>
                      {g.className && <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-surface-3 text-fg-2">{g.className}</span>}
                      <span className="text-[11px] text-muted">{targetPeriodText(g.list[0].t)}</span>
                    </div>
                    {g.list.map(({ t }) => (
                      <div key={t.id} className="rounded-lg border border-line bg-surface p-2 space-y-1.5" data-testid="next-plan-row">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold px-1.5 py-px rounded bg-warning-soft text-warning-fg">{t.subject || 'Tüm dersler'}</span>
                          <span className="text-[11px] text-muted">
                            {t.targetQuestions} soru{t.planCountsLocked ? ' · sayılar sizce değiştirildi' : ''}
                          </span>
                          <span className="ml-auto">
                            <TargetRowActions
                              target={t}
                              confirming={confirmId === t.id}
                              onConfirmChange={(v) => setConfirmId(v ? t.id || null : null)}
                              analyzeTitle="Öğrencinin soru grafiğine git"
                              onEdit={() => {
                                onClose();
                                onEdit(t);
                              }}
                              onDeleted={() => setTick((n) => n + 1)}
                            />
                          </span>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {dates.map((d) => {
                            const n = targetForDay(t, d);
                            const topic = (t.dailyTopics || {})[d] || '';
                            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
                            const dt = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
                            return (
                              <div
                                key={d}
                                title={topic || undefined}
                                className={`min-w-0 rounded-md border px-1 py-1 text-center ${n > 0 ? 'border-brand/30 bg-brand-soft/40' : 'border-line bg-surface-2/40'}`}
                              >
                                <span className="block text-[10px] font-bold text-fg leading-tight">{dt ? GUN[dt.getDay()] : ''}</span>
                                <span className="block text-[9px] text-muted leading-tight">{dt ? `${dt.getDate()}.${dt.getMonth() + 1}` : ''}</span>
                                <span className={`block text-xs font-black tabular-nums ${n > 0 ? 'text-brand-fg' : 'text-subtle'}`}>{n > 0 ? n : '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )
        ) : rows.length === 0 ? (
          <EmptyState icon={Target} title="Hedef bulunamadı" description="Bu filtreye uyan öğrenci hedefi yok. Yeni Hedef ile hedef verebilirsiniz." />
        ) : (
          <ul className="space-y-2" id="student-target-list">
            {weekGroups.map((g) => {
              const open = openGroup === g.key;
              return (
                <li key={g.key} className="rounded-xl border border-line bg-surface-2/60" data-testid="student-target-row">
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-fg truncate">{g.name}</span>
                        {g.className && <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-surface-3 text-fg-2">{g.className}</span>}
                        <span className="text-[11px] text-muted">{targetPeriodText(g.list[0].t)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {g.counted.map(({ t, p }) => (
                          <span
                            key={t.id}
                            className={`text-[10px] font-semibold px-1.5 py-px rounded tabular-nums ${p.done ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg'}`}
                            title={`${t.subject || 'Tüm dersler'}: ${p.solved}/${p.total} soru`}
                          >
                            {t.subject || 'Tüm dersler'} {t.targetQuestions}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted mt-1">
                        Toplam {g.total} soru · {g.counted.length} ders hedefi · Veren: {g.owners.join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      <div className="w-32">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-muted">%{g.percent}</span>
                          <span className="font-semibold text-fg">
                            {g.solved}/{g.total}
                          </span>
                        </div>
                        <ProgressBar percent={g.percent} done={g.done} />
                      </div>
                      {g.studentId && (
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-icon"
                          title="Öğrencinin soru grafiğine git"
                          aria-label="Öğrencinin soru grafiğine git"
                          onClick={() => {
                            onClose();
                            onSelectStudentToAnalyze(g.studentId);
                          }}
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        aria-expanded={open}
                        onClick={() => setOpenGroup(open ? null : g.key)}
                        data-testid="student-target-row-toggle"
                      >
                        Dersler <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <ul className="border-t border-line px-3 py-2 space-y-1.5" data-testid="student-target-row-details">
                      {g.list.map(({ t, p }) => {
                        const mirror = !g.counted.some((x) => x.t === t);
                        return (
                          <li key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-surface border border-line px-2.5 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[11px] font-bold px-1.5 py-px rounded bg-warning-soft text-warning-fg">{t.subject || 'Tüm dersler'}</span>
                              <span className="ml-1.5 text-[11px] text-muted">
                                {t.targetQuestions} soru ({t.dailyTarget}/gün) · {p.solved}/{p.total} çözüldü · {ownerText(t)}
                                {mirror ? ' · plan toplamı, ayrıca sayılmaz' : ''}
                              </span>
                            </div>
                            <TargetRowActions
                              target={t}
                              confirming={confirmId === t.id}
                              onConfirmChange={(v) => setConfirmId(v ? t.id || null : null)}
                              analyzeTitle="Öğrencinin soru grafiğine git"
                              onEdit={() => {
                                onClose();
                                onEdit(t);
                              }}
                              onDeleted={() => setTick((n) => n + 1)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
};
