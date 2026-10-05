import React, { useState } from 'react';
import { User, Search, Plus, Target } from 'lucide-react';
import type { Student, ClassGroup, WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, Segmented, EmptyState } from '../ui/kit';
import { inputCls, localDateStr } from './FormParts';
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
  const [period, setPeriod] = useState<TargetPeriodFilter>('active');
  const [onlyMine, setOnlyMine] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  if (!isOpen) return null;

  const today = localDateStr(new Date());
  const all = dataService.getStudentQuestionTargets();
  const q = query.toLocaleLowerCase('tr-TR').trim();
  const rows = all
    .map((t) => {
      const st = students.find((s) => s.id === t.studentId);
      const name = st?.name || t.studentName || 'Öğrenci';
      const className = st?.className || t.className || classes.find((c) => c.id === (st?.classId || t.classId))?.name || '';
      return { t, st, name, className, classId: st?.classId || t.classId, p: dataService.questionTargetProgress(t, t.studentId || '', allLogs) };
    })
    .filter((r) => period === 'all' || periodOf(r.t, today) === period)
    .filter((r) => classFilter === 'all' || r.classId === classFilter)
    .filter((r) => !onlyMine || dataService.isMyQuestionTarget(r.t))
    .filter((r) => !q || r.name.toLocaleLowerCase('tr-TR').includes(q) || r.className.toLocaleLowerCase('tr-TR').includes(q))
    .sort((a, b) => (b.t.weekStartDate || '').localeCompare(a.t.weekStartDate || '') || a.name.localeCompare(b.name, 'tr'));
  const studentCount = new Set(rows.map((r) => r.t.studentId)).size;

  return (
    <Modal
      open
      id="student-targets-modal"
      onClose={onClose}
      icon={User}
      tone="warning"
      size="lg"
      title="Öğrenci Soru Hedefleri"
      description={`${rows.length} hedef · ${studentCount} öğrenci`}
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
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<TargetPeriodFilter> size="sm" value={period} onChange={setPeriod} items={PERIOD_ITEMS} />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-fg-2 cursor-pointer">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-4 h-4 accent-[var(--color-brand)]" />
            Yalnızca benim verdiklerim
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Target} title="Hedef bulunamadı" description="Bu filtreye uyan öğrenci hedefi yok. Yeni Hedef ile hedef verebilirsiniz." />
        ) : (
          <ul className="space-y-2" id="student-target-list">
            {rows.map(({ t, name, className, p }) => (
              <li key={t.id} className="p-3 rounded-xl border border-line bg-surface-2/60 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="student-target-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-fg truncate">{name}</span>
                    {className && <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-surface-3 text-fg-2">{className}</span>}
                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-warning-soft text-warning-fg">{t.subject || 'Tüm dersler'}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {targetPeriodText(t)} · {t.targetQuestions} soru ({t.dailyTarget}/gün) · Veren: {ownerText(t)}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  <div className="w-32">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted">%{p.percent}</span>
                      <span className="font-semibold text-fg">
                        {p.solved}/{p.total}
                      </span>
                    </div>
                    <ProgressBar percent={p.percent} done={p.done} />
                  </div>
                  <TargetRowActions
                    target={t}
                    confirming={confirmId === t.id}
                    onConfirmChange={(v) => setConfirmId(v ? t.id || null : null)}
                    analyzeTitle="Öğrencinin soru grafiğine git"
                    onAnalyze={
                      t.studentId
                        ? () => {
                            onClose();
                            onSelectStudentToAnalyze(t.studentId!);
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
