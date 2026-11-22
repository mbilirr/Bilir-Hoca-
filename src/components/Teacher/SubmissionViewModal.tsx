import React from 'react';

import { FileText, Clock, CheckCircle2, AlertTriangle, MessageSquareText, Paperclip } from 'lucide-react';
import { Homework, HomeworkSubmission, Student, HomeworkCheckStatus } from '../../types';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';
import { Modal } from '../ui/kit'; // Aşama 351: ortak pencere

// Öğretmenin "Yaptı / Eksik ..." işaretlerken otomatik yazılan notlar (öğrencinin yazdığı not değildir)
const TEACHER_CHECK_NOTES = new Set([
  'Ödev tamamlandı',
  'Eksik ödev',
  'Ödev yapılmadı',
  'İzinli',
  'Derse gelmedi',
]);

const CHECK_LABELS: Record<HomeworkCheckStatus, { label: string; cls: string }> = {
  yapti: { label: 'Yaptı', cls: 'bg-success-soft text-success-fg border-success/30' },
  yapmadi: { label: 'Yapmadı', cls: 'bg-danger-soft text-danger-fg border-danger/30' },
  eksik: { label: 'Eksik', cls: 'bg-warning-soft text-warning-fg border-warning/30' },
  izinli: { label: 'İzinli', cls: 'bg-info-soft text-info-fg border-info/30' },
  gelmedi: { label: 'Gelmedi', cls: 'bg-surface-2 text-fg-2 border-line-strong' },
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

// Aşama 191: Esc ile kapanma ortak katmandan (OverlayLayer)

  if (!isOpen || !homework || !submission) return null;

  const studentName = student?.name || submission.studentName || 'Öğrenci';
  const note = getStudentNote(submission);
  const resources = Array.isArray(submission.resources) ? submission.resources : [];
  const hasAttachments = getSubmissionAttachmentCount(submission) > 0;
  const isLate = submission.status === 'late';
  const isTeacherOnly = !note && !hasAttachments;
  const check = submission.checkStatus ? CHECK_LABELS[submission.checkStatus] : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={studentName}
      description={`Öğrenci teslimi · ${student?.studentNumber ? `No: ${student.studentNumber} · ` : ''}${homework.title}`}
      footer={
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary min-w-24">
          Kapat
        </button>
      }
    >
          {/* Durum rozetleri */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {isTeacherOnly ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border bg-surface-2 text-muted border-line">
                Öğrenci sistemden teslim göndermemiş
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  isLate ? 'bg-warning-soft text-warning-fg border-warning/30' : 'bg-success-soft text-success-fg border-success/30'
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
              <MessageSquareText className="w-4 h-4 text-brand-fg" />
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
              <Paperclip className="w-4 h-4 text-brand-fg" />
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

    </Modal>
  );
};
