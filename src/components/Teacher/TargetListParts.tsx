import React from 'react';
import { Edit3, Trash2, BarChart3 } from 'lucide-react';
import type { WeeklyQuestionTarget } from '../../types';
import { dataService } from '../../services/dataService';
import { cx } from '../ui/kit';
import { localDateStr, shortTrDate } from './FormParts';

// Soru hedefi listeleri için ortak parçalar (Aşama 10)

export type TargetPeriodFilter = 'active' | 'upcoming' | 'past' | 'all';

export const periodOf = (t: WeeklyQuestionTarget, today = localDateStr(new Date())): Exclude<TargetPeriodFilter, 'all'> => {
  const start = t.weekStartDate || '';
  const end = dataService.questionTargetEnd(t);
  if (start > today) return 'upcoming';
  if (end < today) return 'past';
  return 'active';
};

export const PERIOD_ITEMS: Array<{ value: TargetPeriodFilter; label: string; id: string }> = [
  { value: 'active', label: 'Devam eden', id: 'qt-filter-active' },
  { value: 'upcoming', label: 'Gelecek', id: 'qt-filter-upcoming' },
  { value: 'past', label: 'Geçmiş', id: 'qt-filter-past' },
  { value: 'all', label: 'Tümü', id: 'qt-filter-all' },
];

export const targetPeriodText = (t: WeeklyQuestionTarget) => {
  const start = t.weekStartDate || '';
  const end = dataService.questionTargetEnd(t);
  return `${shortTrDate(start)} – ${shortTrDate(end)}`;
};

export const ownerText = (t: WeeklyQuestionTarget) =>
  dataService.isMyQuestionTarget(t) ? 'Siz' : t.assignedByTeacherName || (t.assignedBy && t.assignedBy !== 'Öğretmen' ? t.assignedBy : 'Öğretmen');

export const ProgressBar: React.FC<{ percent: number; done?: boolean }> = ({ percent, done }) => (
  <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden">
    <div
      className={cx('h-full rounded-full transition-all', done ? 'bg-success' : percent >= 60 ? 'bg-warning' : 'bg-brand')}
      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
    />
  </div>
);

// Satır sonundaki işlem düğmeleri (silme iki adımlı onaylı)
export const TargetRowActions: React.FC<{
  target: WeeklyQuestionTarget;
  confirming: boolean;
  onConfirmChange: (v: boolean) => void;
  onAnalyze?: () => void;
  analyzeTitle: string;
  onEdit: () => void;
  onDeleted: () => void;
}> = ({ target, confirming, onConfirmChange, onAnalyze, analyzeTitle, onEdit, onDeleted }) => {
  const canEdit = dataService.canEditQuestionTarget(target);
  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-danger-fg">Silinsin mi?</span>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onConfirmChange(false)}>
          Hayır
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-danger ui-btn-sm"
          data-testid="qt-row-delete-yes"
          onClick={async () => {
            try {
              await dataService.deleteQuestionTargetById(target.id || '');
            } catch {
              /* hata uyarısı gösterildi */
            }
            onConfirmChange(false);
            onDeleted();
          }}
        >
          Evet
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {onAnalyze && (
        <button type="button" onClick={onAnalyze} title={analyzeTitle} aria-label={analyzeTitle} className="ui-btn ui-btn-ghost ui-btn-icon">
          <BarChart3 className="w-4 h-4" />
        </button>
      )}
      {canEdit && (
        <>
          <button type="button" onClick={onEdit} title="Hedefi düzenle" aria-label="Hedefi düzenle" data-testid="qt-row-edit" className="ui-btn ui-btn-ghost ui-btn-icon">
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onConfirmChange(true)}
            title="Hedefi sil"
            aria-label="Hedefi sil"
            data-testid="qt-row-delete"
            className="ui-btn ui-btn-ghost ui-btn-icon text-danger-fg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
};
