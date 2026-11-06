import React, { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { Modal, cx } from '../ui/kit';
import { setPlanItemsSent, weekRangeLabel, type PlanHeader } from '../../services/studyPlanService';
import { runPool, syncSentPlan } from '../../lib/planToTarget';
import { PlanTargetPicker, usePlanTarget } from './PlanTargetPicker';

// ============================================================================
// Aşama 164: Planı geri çek
//  * Öğretmen yalnız KENDİ gönderdiği görevleri geri çeker.
//  * Yöneticiler (genel yönetici, kurum yöneticisi, Müdür / Müdür Yrd.) ayrıca "Planın tamamı" seçebilir
//    (veritabanı da yalnız yöneticilere izin verir).
//  * Kimden: Tüm sınıflar · Seçtiğim sınıflar · Seçtiğim öğrenciler.
//  * Tek veritabanı çağrısı + Soru Kaydet temizliği 6'şar paralel, ilerleme çubuğuyla (düğmeler kilitlenmez).
// ============================================================================

export interface StudyPlanUnsendModalProps {
  weekStart: string;
  students: Student[];
  classes: ClassGroup[];
  /** Öğretmen ekranı başlıkları: sentAt = benim gönderilmiş görevim, anySentAt = planda gönderilmiş görev */
  headers: Record<string, PlanHeader | undefined>;
  canSubject: (subject: string) => boolean;
  /** "Planın tamamı" seçeneği (yalnız yöneticiler) */
  canAll: boolean;
  onClose: (changed: boolean, message?: string) => void;
}

export const StudyPlanUnsendModal: React.FC<StudyPlanUnsendModalProps> = ({ weekStart, students, classes, headers, canSubject, canAll, onClose }) => {
  const [mode, setMode] = useState<'mine' | 'all'>('mine');
  const all = canAll && mode === 'all';
  // Geri çekilebilecek öğrenciler: benim (ya da yöneticide planın) gönderilmiş görevi olanlar
  const candidates = useMemo(() => students.filter((s) => (all ? headers[s.id]?.anySentAt || headers[s.id]?.sentAt : headers[s.id]?.sentAt)), [students, headers, all]);
  const sentSet = useMemo(() => new Set(candidates.map((s) => s.id)), [candidates]);
  const target = usePlanTarget(candidates, classes);
  const askTarget = students.length > 1;
  const chosen = askTarget ? target.selected : candidates;
  const single = students.length === 1;

  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [progress, setProgress] = useState('');
  const [bar, setBar] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ students: number; tasks: number; cleanFailed: number } | null>(null);

  const run = async () => {
    if (phase !== 'form' || !chosen.length) return;
    const list = chosen;
    setPhase('running');
    setError(null);
    try {
      setProgress(all ? 'Planın tamamı geri çekiliyor…' : 'Görevleriniz geri çekiliyor…');
      const changed = await setPlanItemsSent(
        list.map((s) => s.id),
        weekStart,
        false,
        all
      );
      const hit = list.filter((s) => (changed[s.id] || 0) > 0);
      const tasks = Object.values(changed).reduce((a, b) => a + b, 0);
      // Soru Kaydet'teki bu haftanın plan konuları ve hedefleri (geri çekilen görevlerden gelenler) kaldırılır;
      // başka öğretmenin hâlâ gönderilmiş görevleri yerinde kalır.
      let cleanFailed = 0;
      if (hit.length) {
        setProgress("Soru Kaydet'ten kaldırılıyor…");
        await runPool(
          hit,
          6,
          async (st) => {
            try {
              await syncSentPlan(st, weekStart, canSubject, true);
            } catch {
              cleanFailed++;
            }
          },
          (done, total) => setBar({ done, total })
        );
      }
      setResult({ students: hit.length, tasks, cleanFailed });
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Plan geri çekilemedi.');
      setPhase('done');
    } finally {
      setProgress('');
      setBar(null);
    }
  };

  const message = result
    ? result.students
      ? `${result.students} öğrenciden ${all ? 'planın tamamı' : 'görevleriniz'} geri çekildi (${result.tasks} görev); artık görmüyorlar. Soru Kaydet bölümlerindeki bu görevlerin konuları ve hedefleri de kaldırıldı.${result.cleanFailed ? ` ${result.cleanFailed} öğrencide Soru Kaydet temizlenemedi; tekrar geri çekmeyi deneyin.` : ''}`
      : 'Seçilen öğrencilerde geri çekilecek gönderilmiş görev bulunamadı.'
    : undefined;
  const close = () => phase !== 'running' && onClose(!!result?.students, message);

  return (
    <Modal
      open
      id="plan-unsend-modal"
      onClose={close}
      closeOnBackdrop={phase !== 'running'}
      icon={Undo2}
      tone="danger"
      size={askTarget ? 'lg' : 'sm'}
      title="Planı geri çek"
      description={`${single ? students[0].name : `${chosen.length} öğrenci seçili`} · ${weekRangeLabel(weekStart)}`}
      footer={
        phase === 'form' ? (
          <>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm w-28" onClick={() => onClose(false)}>
              Vazgeç
            </button>
            <button type="button" id="plan-unsend-run" className="ui-btn ui-btn-danger ui-btn-sm w-28" disabled={!chosen.length} onClick={run}>
              <Undo2 className="w-3.5 h-3.5" /> Geri çek
            </button>
          </>
        ) : (
          <button type="button" id="plan-unsend-close" className="ui-btn ui-btn-primary ui-btn-sm w-28" disabled={phase === 'running'} onClick={close}>
            {phase === 'running' ? 'İşleniyor…' : 'Kapat'}
          </button>
        )
      }
    >
      {phase === 'form' ? (
        <div className="space-y-3">
          {canAll && (
            <div className="space-y-1.5" id="plan-unsend-mode">
              <p className="text-xs font-bold text-fg">Hangi görevler?</p>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Hangi görevler geri çekilsin">
                {(
                  [
                    ['mine', 'Yalnız benimkiler'],
                    ['all', 'Planın tamamı'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    data-mode={k}
                    aria-pressed={mode === k}
                    onClick={() => setMode(k)}
                    className={cx('ui-btn ui-btn-sm w-full', mode === k ? 'ui-btn-primary' : 'ui-btn-secondary')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted">"Planın tamamı" başka öğretmenlerin görevlerini de öğrencilerden kaldırır (yalnız yöneticilerde görünür).</p>
            </div>
          )}
          {askTarget &&
            (candidates.length ? (
              <PlanTargetPicker
                idPrefix="plan-unsend"
                question="Kimden geri çekilsin?"
                classRows={target.classRows}
                state={target.state}
                setState={target.setState}
                sentSet={sentSet}
              />
            ) : null)}
          {!candidates.length ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted" id="plan-unsend-empty">
              {all ? 'Bu haftada gönderilmiş görev yok.' : 'Bu haftada sizin gönderdiğiniz görev yok.'}
            </p>
          ) : (
            <p className="text-[11px] text-muted" id="plan-unsend-note">
              {all
                ? 'Seçilen öğrencilerden bu haftanın bütün görevleri geri çekilir.'
                : 'Yalnız sizin gönderdiğiniz görevler geri çekilir; diğer öğretmenlerin görevleri öğrencide kalır.'}{' '}
              Görevler silinmez, taslak olarak kalır; Soru Kaydet'teki konuları ve hedefleri kaldırılır.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2" id="plan-unsend-result">
          {progress && (
            <div className="space-y-1.5" role="status" id="plan-unsend-progress">
              <p className="text-sm font-semibold text-fg">{progress}</p>
              {bar && bar.total > 0 && (
                <>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${Math.round((bar.done / bar.total) * 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-muted">
                    {bar.done} / {bar.total} öğrenci işlendi…
                  </p>
                </>
              )}
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
              {error}
            </div>
          )}
          {phase === 'done' && !error && message && (
            <div className={cx('rounded-xl px-3 py-2 text-sm font-semibold', result?.students ? 'bg-success-soft text-success-fg' : 'bg-surface-2 text-fg-2')} id="plan-unsend-summary">
              {message}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
