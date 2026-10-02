import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Clock, CheckCircle2, AlertTriangle, MessageSquareText, Paperclip } from 'lucide-react';
import { Homework, HomeworkSubmission, Student, HomeworkCheckStatus } from '../../types';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';

// Öğretmenin "Yaptı / Eksik ..." işaretlerken otomatik yazılan notlar (öğrencinin yazdığı not değildir)
const TEACHER_CHECK_NOTES = new Set([
  'Ödev tamamlandı',
  'Eksik ödev',
  'Ödev yapılmadı',
  'İzinli',
  'Derse gelmedi',
]);

const CHECK_LABELS: Record<HomeworkCheckStatus, { label: string; cls: string }> = {
  yapti: { label: 'Yaptı', cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' },
  yapmadi: { label: 'Yapmadı', cls: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' },
  eksik: { label: 'Eksik', cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' },
  izinli: { label: 'İzinli', cls: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30' },
  gelmedi: { label: 'Gelmedi', cls: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30' },
};

// Öğrencinin kendi yazdığı not (öğretmenin otomatik notu sayılmaz)
export const getStudentNote = (sub?: HomeworkSubmission | null): string => {
  const note = (sub?.notes || '').trim();
  if (!note || TEACHER_CHECK_NOTES.has(note)) return '';
  return note;
};

// Öğrencinin teslimle birlikte gönderdiği ek (dosya / bağlantı) sayısı
export const getSubmissionAttachmentCount = (sub?: HomeworkSubmission | null): number => {
  if (!sub) return 0;
  const resources = Array.isArray(sub.resources) ? sub.resources : [];
  const extraLink = sub.attachmentLink && !resources.some((r) => r.url === sub.attachmentLink) ? 1 : 0;
  return resources.length + extraLink;
};

// Öğretmenin bakabileceği bir içerik (not, dosya veya bağlantı) var mı?
export const submissionHasContent = (sub?: HomeworkSubmission | null): boolean =>
  !!sub && (getSubmissionAttachmentCount(sub) > 0 || getStudentNote(sub) !== '');

const formatDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface SubmissionViewModalProps {
  homework: Homework | null;
  student: Student | null;
  submission: HomeworkSubmission | null;
  onClose: () => void;
}

export const SubmissionViewModal: React.FC<SubmissionViewModalProps> = ({ homework, student, submission, onClose }) => {
  const isOpen = !!homework && !!submission;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !homework || !submission) return null;

  const studentName = student?.name || submission.studentName || 'Öğrenci';
  const note = getStudentNote(submission);
  const resources = Array.isArray(submission.resources) ? submission.resources : [];
  const hasAttachments = getSubmissionAttachmentCount(submission) > 0;
  const isLate = submission.status === 'late';
  const isTeacherOnly = !note && !hasAttachments;
  const check = submission.checkStatus ? CHECK_LABELS[submission.checkStatus] : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${studentName} teslimi`}
    >
      <div className="min-h-full flex items-center justify-center py-4">
        <div
          className="relative w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl p-5 sm:p-6 text-fg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Başlık */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-line mb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Öğrenci Teslimi</p>
              <h3 className="text-lg font-bold text-fg truncate">{studentName}</h3>
              <p className="text-xs text-muted truncate">
                {student?.studentNumber ? `No: ${student.studentNumber} · ` : ''}
                {homework.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="p-1.5 text-subtle hover:text-fg-2 hover:bg-surface-2 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Durum rozetleri */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {isTeacherOnly ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border bg-surface-2 text-muted border-line">
                Öğrenci sistemden teslim göndermemiş
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  isLate ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                }`}
              >
                {isLate ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {isLate ? 'Geç teslim' : 'Zamanında teslim'}
              </span>
            )}
            {!isTeacherOnly && formatDateTime(submission.submittedAt) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-surface-2 text-muted border-line">
                <Clock className="w-3.5 h-3.5" />
                {formatDateTime(submission.submittedAt)}
              </span>
            )}
            {check && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${check.cls}`}>
                Kontrol: {check.label}
              </span>
            )}
          </div>

          {/* Öğrenci notu */}
          <div className="mb-4">
            <h4 className="text-xs font-bold text-fg-2 mb-1.5 flex items-center gap-1.5">
              <MessageSquareText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Öğrencinin Notu
            </h4>
            {note ? (
              <p className="text-sm text-fg whitespace-pre-wrap break-words bg-surface-2 border border-line rounded-xl p-3">
                {note}
              </p>
            ) : (
              <p className="text-xs text-subtle italic">Not yazılmamış.</p>
            )}
          </div>

          {/* Ekler */}
          <div>
            <h4 className="text-xs font-bold text-fg-2 mb-1.5 flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Gönderilen Dosya ve Bağlantılar
            </h4>
            {hasAttachments ? (
              <div className="bg-fg rounded-xl p-3">
                <HomeworkResourceViewer resources={resources} legacyAttachmentUrl={submission.attachmentLink} />
              </div>
            ) : (
              <p className="text-xs text-subtle italic flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Dosya veya bağlantı eklenmemiş.
              </p>
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-line flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-fg-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
