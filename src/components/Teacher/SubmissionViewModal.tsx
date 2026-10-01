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
  yapti: { label: 'Yaptı', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  yapmadi: { label: 'Yapmadı', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  eksik: { label: 'Eksik', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  izinli: { label: 'İzinli', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  gelmedi: { label: 'Gelmedi', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
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
          className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 sm:p-6 text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Başlık */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 mb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Öğrenci Teslimi</p>
              <h3 className="text-lg font-bold text-slate-900 truncate">{studentName}</h3>
              <p className="text-xs text-slate-500 truncate">
                {student?.studentNumber ? `No: ${student.studentNumber} · ` : ''}
                {homework.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Durum rozetleri */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {isTeacherOnly ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-600 border-slate-200">
                Öğrenci sistemden teslim göndermemiş
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  isLate ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {isLate ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {isLate ? 'Geç teslim' : 'Zamanında teslim'}
              </span>
            )}
            {!isTeacherOnly && formatDateTime(submission.submittedAt) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-slate-50 text-slate-600 border-slate-200">
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
            <h4 className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquareText className="w-4 h-4 text-indigo-500" />
              Öğrencinin Notu
            </h4>
            {note ? (
              <p className="text-sm text-slate-800 whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-xl p-3">
                {note}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">Not yazılmamış.</p>
            )}
          </div>

          {/* Ekler */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Paperclip className="w-4 h-4 text-indigo-500" />
              Gönderilen Dosya ve Bağlantılar
            </h4>
            {hasAttachments ? (
              <div className="bg-slate-900 rounded-xl p-3">
                <HomeworkResourceViewer resources={resources} legacyAttachmentUrl={submission.attachmentLink} />
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Dosya veya bağlantı eklenmemiş.
              </p>
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
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
