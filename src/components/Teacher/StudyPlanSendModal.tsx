import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, MessageCircle, Send, Smartphone } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { Modal, cx } from '../ui/kit';
import {
  createPlanGroup,
  loadPlan,
  mailPlanToStudent,
  planWhatsappText,
  sendPlan,
  weekRangeLabel,
  whatsappUrl,
  type PlanGroupKind,
  type PlanItem,
} from '../../services/studyPlanService';
import { planPdfBase64 } from '../../lib/studyPlanExport';

// ============================================================================
// Haftalık planı gönder (Aşama 22)
//  * Plan her zaman öğrencinin uygulamasında görünür ("Bugün yapılması gerekenler").
//  * İsteğe bağlı: e-posta (plan gövdede + PDF eki + kişisel işaretleme bağlantısı).
//  * İsteğe bağlı: WhatsApp (tıklayınca hazır mesaj açılır, öğretmen gönderir).
//  * E-posta gönderilirse planın son görev günü 20:00'de öğretmene rapor gelir
//    (tek öğrenci: öğrenci raporu; sınıf / seçili öğrenciler: toplu karne).
// ============================================================================

const isEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

type RowState = {
  student: Student;
  items: PlanItem[];
  mail: 'idle' | 'sending' | 'sent' | 'no-email' | 'error' | 'skipped';
  mailError?: string;
  link?: string;
  waOpened?: boolean;
};

export interface StudyPlanSendModalProps {
  weekStart: string;
  students: Student[];
  classes: ClassGroup[];
  kind: PlanGroupKind;
  classId?: string;
  teacherName: string;
  title?: string;
  onClose: (changed: boolean) => void;
}

export const StudyPlanSendModal: React.FC<StudyPlanSendModalProps> = ({ weekStart, students, classes, kind, classId, teacherName, title, onClose }) => {
  const withEmail = useMemo(() => students.filter((s) => isEmail(s.email)).length, [students]);
  const [mail, setMail] = useState(false);
  const [wa, setWa] = useState(false);
  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [progress, setProgress] = useState('');
  const [rows, setRows] = useState<RowState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const single = students.length === 1;
  const groupLabel =
    kind === 'class'
      ? `${classes.find((c) => c.id === classId)?.name || 'Sınıf'} sınıfının toplu karnesi`
      : kind === 'students'
        ? 'seçili öğrencilerin toplu karnesi'
        : 'öğrencinin plan raporu';

  const patchRow = (id: string, patch: Partial<RowState>) => setRows((cur) => cur.map((r) => (r.student.id === id ? { ...r, ...patch } : r)));

  const run = async () => {
    if (phase !== 'form') return;
    setPhase('running');
    setError(null);
    const list: RowState[] = students.map((s) => ({ student: s, items: [], mail: mail ? (isEmail(s.email) ? 'idle' : 'no-email') : 'skipped' }));
    setRows(list);
    try {
      // 1) Plan uygulamada görünsün (ödev olarak gönder)
      for (let i = 0; i < students.length; i++) {
        setProgress(`Plan gönderiliyor (${i + 1}/${students.length})…`);
        await sendPlan(students[i].id, weekStart, teacherName);
      }
      setChanged(true);
      // 2) E-posta / WhatsApp için gönderim grubu ve kişisel bağlantılar
      let groupId = '';
      let links: Record<string, string> = {};
      if (mail || wa) {
        setProgress('E-posta / WhatsApp hazırlanıyor…');
        try {
          const g = await createPlanGroup({ weekStart, studentIds: students.map((s) => s.id), kind, classId, mailStudents: mail });
          groupId = g.groupId;
          links = g.links;
        } catch (e: any) {
          if (mail) throw e;
          // Yalnız WhatsApp: işaretleme bağlantısı olmadan da mesaj hazırlanabilir
        }
      }
      // 3) Her öğrenci: plan görevleri (WhatsApp metni ve PDF için) ve e-posta
      for (let i = 0; i < list.length; i++) {
        const st = list[i].student;
        setProgress(mail ? `E-posta gönderiliyor (${i + 1}/${list.length})…` : `Hazırlanıyor (${i + 1}/${list.length})…`);
        const p = await loadPlan(st.id, weekStart).catch(() => ({ header: null, items: [] as PlanItem[] }));
        patchRow(st.id, { items: p.items, link: links[st.id] });
        list[i] = { ...list[i], items: p.items, link: links[st.id] };
        if (mail && groupId && isEmail(st.email)) {
          patchRow(st.id, { mail: 'sending' });
          try {
            const pdf = await planPdfBase64({ studentName: st.name, className: st.className || classes.find((c) => c.id === st.classId)?.name, weekStart, items: p.items });
            const r = await mailPlanToStudent(groupId, st.id, pdf);
            if (r.ok && (r.sent || 0) > 0) patchRow(st.id, { mail: 'sent' });
            else if (r.ok && r.rateLimited) patchRow(st.id, { mail: 'error', mailError: 'Bugün bu öğrenciye yeterince e-posta gönderildi.' });
            else if (r.ok && r.noEmail) patchRow(st.id, { mail: 'no-email' });
            else patchRow(st.id, { mail: 'error', mailError: (r.errors && r.errors[0]) || r.error || (r.notConfigured ? 'E-posta hesabı ayarlanmamış.' : 'Gönderilemedi.') });
          } catch (e: any) {
            patchRow(st.id, { mail: 'error', mailError: e?.message || 'Gönderilemedi.' });
          }
        }
      }
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Plan gönderilemedi.');
      setPhase('done');
    } finally {
      setProgress('');
    }
  };

  const openWa = (r: RowState) => {
    const text = planWhatsappText(r.student.name.split(' ')[0] || r.student.name, weekStart, r.items, r.link);
    window.open(whatsappUrl(r.student.phone, text), '_blank', 'noopener,noreferrer');
    patchRow(r.student.id, { waOpened: true });
  };

  const sentCount = rows.filter((r) => r.mail === 'sent').length;

  return (
    <Modal
      open
      id="plan-send-modal"
      onClose={() => phase !== 'running' && onClose(changed)}
      closeOnBackdrop={phase !== 'running'}
      icon={Send}
      tone="brand"
      size={single ? 'md' : 'lg'}
      title={title || 'Planı öğrenciye gönder'}
      description={`${single ? students[0].name : `${students.length} öğrenci`} · ${weekRangeLabel(weekStart)}`}
      footer={
        phase === 'form' ? (
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onClose(false)}>
              Vazgeç
            </button>
            <button type="button" id="plan-send-run" className="ui-btn ui-btn-primary" onClick={run}>
              <Send className="w-4 h-4" /> Gönder
            </button>
          </>
        ) : (
          <button type="button" id="plan-send-close" className="ui-btn ui-btn-primary" disabled={phase === 'running'} onClick={() => onClose(changed)}>
            {phase === 'running' ? 'Gönderiliyor…' : 'Kapat'}
          </button>
        )
      }
    >
      {phase === 'form' ? (
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 opacity-90">
            <input type="checkbox" checked disabled className="mt-0.5 w-4 h-4" />
            <span className="text-sm">
              <span className="font-semibold text-fg">Öğrencinin uygulamasında göster</span>
              <span className="block text-[11px] text-muted">Öğrenci ana sayfasında her gün "Bugün yapılması gerekenler" olarak görür ve işaretler.</span>
            </span>
          </label>
          <label className={cx('flex items-start gap-2.5 cursor-pointer rounded-xl border px-3 py-2.5', mail ? 'border-brand bg-brand-soft/40' : 'border-line')}>
            <input type="checkbox" id="plan-send-mail" checked={mail} onChange={(e) => setMail(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]" />
            <span className="text-sm">
              <span className="font-semibold text-fg inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" /> E-posta ile de gönder (PDF ekli)
              </span>
              <span className="block text-[11px] text-muted">
                Plan e-postanın içinde ve PDF eki olarak gider. Öğrenci e-postadaki kişisel bağlantıdan görevlerini "yaptım" diye işaretleyebilir; işaretler sisteme kaydedilir.
              </span>
              <span className="block text-[11px] text-muted mt-1" id="plan-send-email-count">
                {withEmail === students.length
                  ? single
                    ? 'Öğrencinin e-posta adresi kayıtlı.'
                    : `${withEmail} öğrencinin hepsinin e-posta adresi kayıtlı.`
                  : `${withEmail} / ${students.length} öğrencinin e-posta adresi kayıtlı${withEmail === 0 ? ' (e-posta gidemez)' : '; diğerleri yalnız uygulamada görür'}.`}
              </span>
              {mail && (
                <span className="mt-2 flex items-start gap-1.5 rounded-lg bg-info-soft text-info-fg px-2.5 py-1.5 text-[11px] font-semibold" id="plan-send-report-note">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Planın son görev günü saat 20:00'de size {groupLabel} e-postayla gelir.
                </span>
              )}
            </span>
          </label>
          <label className={cx('flex items-start gap-2.5 cursor-pointer rounded-xl border px-3 py-2.5', wa ? 'border-brand bg-brand-soft/40' : 'border-line')}>
            <input type="checkbox" id="plan-send-wa" checked={wa} onChange={(e) => setWa(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]" />
            <span className="text-sm">
              <span className="font-semibold text-fg inline-flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> WhatsApp mesajı hazırla
              </span>
              <span className="block text-[11px] text-muted">
                Gönderdikten sonra her öğrenci için bir WhatsApp düğmesi çıkar; tıklayınca planın özeti ve işaretleme bağlantısı hazır mesaj olarak açılır, siz gönderirsiniz. Telefonu kayıtlı değilse kişiyi WhatsApp'ta siz seçersiniz.
              </span>
            </span>
          </label>
          {!mail && <p className="text-[11px] text-muted">E-posta seçilmezse öğretmene otomatik rapor gönderilmez.</p>}
        </div>
      ) : (
        <div className="space-y-3" id="plan-send-result">
          {progress && (
            <p className="text-sm font-semibold text-fg" role="status">
              {progress}
            </p>
          )}
          {error && (
            <div role="alert" id="plan-send-error" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
              {error}
            </div>
          )}
          {phase === 'done' && !error && (
            <div className="rounded-xl bg-success-soft text-success-fg px-3 py-2 text-sm font-semibold" id="plan-send-summary">
              Plan {single ? 'öğrenciye' : `${students.length} öğrenciye`} gönderildi; uygulamada görünüyor.
              {mail ? ` ${sentCount} öğrenciye e-posta gitti.` : ''}
              {mail && sentCount > 0 ? ' Rapor, planın son görev günü 20:00\'de size gelecek.' : ''}
            </div>
          )}
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((r) => (
              <li key={r.student.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-send-row={r.student.id} data-mail={r.mail}>
                <span className="text-sm font-semibold text-fg min-w-0 flex-1 truncate">{r.student.name}</span>
                {r.mail === 'sending' && <span className="text-[11px] text-muted">E-posta gönderiliyor…</span>}
                {r.mail === 'sent' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success-fg">
                    <CheckCircle2 className="w-3.5 h-3.5" /> E-posta gitti
                  </span>
                )}
                {r.mail === 'no-email' && <span className="text-[11px] font-semibold text-warning-fg">E-posta adresi yok</span>}
                {r.mail === 'error' && (
                  <span className="text-[11px] font-semibold text-danger-fg" title={r.mailError}>
                    E-posta gitmedi{r.mailError ? `: ${r.mailError}` : ''}
                  </span>
                )}
                {wa && phase === 'done' && (
                  <button
                    type="button"
                    data-wa-button
                    onClick={() => openWa(r)}
                    className={cx('ui-btn ui-btn-sm', r.waOpened ? 'ui-btn-secondary' : 'ui-btn-primary')}
                    title={r.student.phone ? `${r.student.phone} numarasına WhatsApp mesajı` : 'Telefon kayıtlı değil; kişiyi WhatsApp\'ta seçersiniz'}
                  >
                    {r.student.phone ? <Smartphone className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
                    {r.waOpened ? 'Tekrar aç' : 'WhatsApp'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};
