import React, { useState, useMemo } from 'react';
import { Users, Search, Plus } from 'lucide-react';
import type { Student, ClassGroup, WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, Segmented, EmptyState } from '../ui/kit';
import { inputCls, localDateStr } from './FormParts';
import { PERIOD_ITEMS, TargetPeriodFilter, periodOf, targetPeriodText, ownerText, ProgressBar, TargetRowActions } from './TargetListParts';

// Sınıf soru hedefleri listesi (Aşama 10)
interface Props {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  students: Student[];
  allLogs: StudentQuestionLog[];
  onEdit: (target: WeeklyQuestionTarget) => void;
  onNew: () => void;
  onSelectClassToAnalyze: (classId: string) => void;
}

export const ClassTargetsModal: React.FC<Props> = ({ isOpen, onClose, classes, students, allLogs, onEdit, onNew, onSelectClassToAnalyze }) => {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<TargetPeriodFilter>('active');
  const [onlyMine, setOnlyMine] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, setTick] = useState(0);
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
  const q = query.toLocaleLowerCase('tr-TR').trim();
  const rows = dataService
    .getClassQuestionTargets()
    .map((t) => {
      const cls = classes.find((c) => c.id === t.classId);
      const name = cls?.name || t.className || 'Sınıf';
      const members = students.filter((s) => s.classId === t.classId);
      const progresses = members.map((s) => dataService.questionTargetProgress(t, s.id, byStudent.get(s.id) || []));
      const doneCount = progresses.filter((p) => p.done).length;
      const avg = progresses.length ? Math.round(progresses.reduce((a, p) => a + p.percent, 0) / progresses.length) : 0;
      return { t, name, members: members.length, doneCount, avg };
    })
    .filter((r) => period === 'all' || periodOf(r.t, today) === period)
    .filter((r) => !onlyMine || dataService.isMyQuestionTarget(r.t))
    .filter((r) => !q || r.name.toLocaleLowerCase('tr-TR').includes(q))
    .sort((a, b) => (b.t.weekStartDate || '').localeCompare(a.t.weekStartDate || '') || a.name.localeCompare(b.name, 'tr'));

  return (
    <Modal
      open
      id="class-targets-modal"
      onClose={onClose}
      icon={Users}
      tone="brand"
      size="lg"
      title="Sınıf Soru Hedefleri"
      description={`${rows.length} hedef`}
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sınıf ara (ör. 8/A)…" className={`${inputCls} pl-9`} />
          </div>
          <button
            type="button"
            id="btn-new-class-target"
            onClick={() => {
              onClose();
              onNew();
            }}
            className="ui-btn ui-btn-primary shrink-0"
          >
            <Plus className="w-4 h-4" /> Sınıfa Hedef Ver
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<TargetPeriodFilter> size="sm" value={period} onChange={setPeriod} items={PERIOD_ITEMS} />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-fg-2 cursor-pointer">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand)]" />
            Yalnızca benim verdiklerim
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Sınıf hedefi bulunamadı" description="Bu filtreye uyan sınıf hedefi yok." />
        ) : (
          <ul className="space-y-2" id="class-target-list">
            {rows.map(({ t, name, members, doneCount, avg }) => (
              <li key={t.id} className="p-3 rounded-xl border border-line bg-surface-2/60 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="class-target-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-fg">{name}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-surface-3 text-fg-2">{members} öğrenci</span>
                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-warning-soft text-warning-fg">{t.subject || 'Tüm dersler'}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {targetPeriodText(t)} · öğrenci başı {t.targetQuestions} soru ({t.dailyTarget}/gün) · Veren: {ownerText(t)}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  <div className="w-36">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted">Ort. %{avg}</span>
                      <span className="font-semibold text-fg">
                        {doneCount}/{members} tamamladı
                      </span>
                    </div>
                    <ProgressBar percent={avg} done={members > 0 && doneCount === members} />
                  </div>
                  <TargetRowActions
                    target={t}
                    confirming={confirmId === t.id}
                    onConfirmChange={(v) => setConfirmId(v ? t.id || null : null)}
                    analyzeTitle="Sınıfın soru analizine git"
                    onAnalyze={
                      t.classId
                        ? () => {
                            onClose();
                            onSelectClassToAnalyze(t.classId!);
                          }
                        : undefined
                    }
                    onEdit={() => {
                      onClose();
                      onEdit(t);
                    }}
                    onDeleted={() => setTick((n) => n + 1)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
