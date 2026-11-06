import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, MessageCircle, Send, Smartphone } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { Modal, cx } from '../ui/kit';
import {
  createPlanGroup,
  loadPlansFor,
  mailPlanToStudent,
  planItemOwnership,
  planWhatsappText,
  setPlanItemsSent,
  weekRangeLabel,
  whatsappUrl,
  type PlanGroupKind,
  type PlanItem,
} from '../../services/studyPlanService';
import { planPdfBase64 } from '../../lib/studyPlanExport';
import { dataService } from '../../services/dataService';
import { runPool, syncSentPlan } from '../../lib/planToTarget';
import { PlanTargetPicker, usePlanTarget } from './PlanTargetPicker';

// ============================================================================
// Haftalık planı gönder (Aşama 22)
//  * Plan her zaman öğrencinin uygulamasında görünür ("Bugün yapılması gerekenler").
//  * İsteğe bağlı: e-posta (plan gövdede + PDF eki + kişisel işaretleme bağlantısı).
//  * İsteğe bağlı: WhatsApp (tıklayınca hazır mesaj açılır, öğretmen gönderir).
//  * E-posta gönderilirse planın son görev günü 20:00'de öğretmene rapor gelir
//    (tek öğrenci: öğrenci raporu; sınıf / seçili öğrenciler: toplu karne).
// Aşama 164:
//  * Yalnız GÖNDERENİN kendi görevleri gönderilir (tek veritabanı çağrısı); diğer öğretmenlerin görevleri onların gönderimine bağlıdır.
//  * "Kime gönderilsin?": Tüm sınıflar · Seçtiğim sınıflar · Seçtiğim öğrenciler.
//  * Soru Kaydet aktarımı ve e-posta 6'şar / 3'er paralel, ilerleme çubuğuyla (kilitlenme yok).
//  * E-posta / PDF / WhatsApp yalnız gönderenin gönderilmiş görevlerini içerir.
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
  /** Aşama 35: verilirse gönderimden sonra görevler öğrencinin Soru Kaydet formuna da aktarılır (öğretmenin yetkili olduğu dersler) */
  canSubject?: (subject: string) => boolean;
  /** Aşama 52/164: kime gönderileceği pencerede sorulur (sınıf görünümü) */
  pickClasses?: boolean;
  /** Aşama 52: sınıf mevcutları (tüm sınıf seçilince sınıf karnesi için) */
  classSizes?: Record<string, number>;
  /** Aşama 52/164: görevlerimi daha önce gönderdiğim öğrenciler ("gönderildi" etiketi) */
  sentIds?: string[];
  onClose: (changed: boolean) => void;
}

export const StudyPlanSendModal: React.FC<StudyPlanSendModalProps> = ({
  weekStart,
  students: allStudents,
  classes,
  kind: kindProp,
  classId: classIdProp,
  teacherName: _teacherName,
  title,
  canSubject,
  pickClasses,
  classSizes,
  sentIds,
  onClose,
}) => {
  // ---- Aşama 164: kime gönderilsin?
  const askTarget = !!pickClasses && allStudents.length > 1;
  const target = usePlanTarget(allStudents, classes);
  const sentSet = useMemo(() => new Set(sentIds || []), [sentIds]);
  const students = askTarget ? target.selected : allStudents;
  const { kind, classId } = useMemo((): { kind: PlanGroupKind; classId?: string } => {
    if (!askTarget) return { kind: kindProp, classId: classIdProp };
    if (students.length <= 1) return { kind: 'student' };
    const cids = Array.from(new Set(students.map((s) => s.classId || '')));
    if (cids.length === 1 && classSizes && classSizes[cids[0]] === students.length) return { kind: 'class', classId: cids[0] };
    return { kind: 'students' };
  }, [askTarget, kindProp, classIdProp, students, classSizes]);

  const withEmail = useMemo(() => students.filter((s) => isEmail(s.email)).length, [students]);
  const [mail, setMail] = useState(false);
  const [wa, setWa] = useState(false);
  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [progress, setProgress] = useState('');
  const [bar, setBar] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [transferred, setTransferred] = useState(0);
  const [transferredQ, setTransferredQ] = useState(0); // Aşama 43: soru hedefi olarak aktarılan toplam

  const single = students.length === 1;
  const groupLabel =
    kind === 'class'
      ? `${classes.find((c) => c.id === classId)?.name || 'Sınıf'} sınıfının toplu karnesi`
      : kind === 'students'
        ? 'seçili öğrencilerin toplu karnesi'
        : 'öğrencinin plan raporu';

  const patchRow = (id: string, patch: Partial<RowState>) => setRows((cur) => cur.map((r) => (r.student.id === id ? { ...r, ...patch } : r)));

  const run = async () => {
    if (phase !== 'form' || students.length === 0) return;
    const list0 = students;
    setPhase('running');
    setError(null);
    const list: RowState[] = list0.map((s) => ({ student: s, items: [], mail: mail ? (isEmail(s.email) ? 'idle' : 'no-email') : 'skipped' }));
    setRows(list);
    try {
      // 1) Benim görevlerim tek çağrıda gönderilir (öğrenci uygulamasında görünür)
      setProgress('Görevleriniz gönderiliyor…');
      await setPlanItemsSent(
        list0.map((s) => s.id),
        weekStart,
        true
      );
      setChanged(true);
      // Aşama 43: öğrencinin soru haftası bu planın başladığı günden başlasın
      void dataService.syncPlanWeekStarts();
      // 2) Soru Kaydet'e aktarım (6'şar paralel, ilerlemeli)
      if (canSubject) {
        setProgress("Soru Kaydet'e aktarılıyor…");
        await runPool(
          list0,
          6,
          async (st) => {
            try {
              const t = await syncSentPlan(st, weekStart, canSubject);
              if (t?.subjects.length) setTransferred((n) => n + 1);
              if (t?.questionTotal) setTransferredQ((n) => n + t.questionTotal);
            } catch {
              /* aktarılamazsa "Planı yenile" ile tekrar denenebilir */
            }
          },
          (done, total) => setBar({ done, total })
        );
      }
      // 3) E-posta / WhatsApp: yalnız BENİM gönderilmiş görevlerim
      if (mail || wa) {
        setProgress('E-posta / WhatsApp hazırlanıyor…');
        setBar(null);
        const [fresh, mine] = await Promise.all([loadPlansFor(list0.map((s) => s.id), weekStart), planItemOwnership()]);
        const byStudent = new Map<string, PlanItem[]>();
        for (const it of fresh.items) {
          if (!it.sentAt || !mine(it)) continue;
          if (!byStudent.has(it.studentId)) byStudent.set(it.studentId, []);
          byStudent.get(it.studentId)!.push(it);
        }
        let groupId = '';
        let links: Record<string, string> = {};
        try {
          const g = await createPlanGroup({ weekStart, studentIds: list0.map((s) => s.id), kind, classId, mailStudents: mail });
          groupId = g.groupId;
          links = g.links;
        } catch (e: any) {
          if (mail) throw e;
          // Yalnız WhatsApp: işaretleme bağlantısı olmadan da mesaj hazırlanabilir
        }
        for (let i = 0; i < list.length; i++) {
          const its = byStudent.get(list[i].student.id) || [];
          list[i] = { ...list[i], items: its, link: links[list[i].student.id] };
        }
        setRows([...list]);
        if (mail && groupId) {
          setProgress('E-posta gönderiliyor…');
          const mailList = list.filter((r) => isEmail(r.student.email));
          await runPool(
            mailList,
            3,
            async (r) => {
              const st = r.student;
              if (!r.items.length) {
                patchRow(st.id, { mail: 'error', mailError: 'Bu öğrencide gönderilmiş göreviniz yok.' });
                return;
              }
              patchRow(st.id, { mail: 'sending' });
              try {
                const pdf = await planPdfBase64({ studentName: st.name, className: st.className || classes.find((c) => c.id === st.classId)?.name, weekStart, items: r.items });
                const m = await mailPlanToStudent(groupId, st.id, pdf);
                if (m.ok && (m.sent || 0) > 0) patchRow(st.id, { mail: 'sent' });
                else if (m.ok && m.rateLimited) patchRow(st.id, { mail: 'error', mailError: 'Bugün bu öğrenciye yeterince e-posta gönderildi.' });
                else if (m.ok && m.noEmail) patchRow(st.id, { mail: 'no-email' });
                else patchRow(st.id, { mail: 'error', mailError: (m.errors && m.errors[0]) || m.error || (m.notConfigured ? 'E-posta hesabı ayarlanmamış.' : 'Gönderilemedi.') });
              } catch (e: any) {
                patchRow(st.id, { mail: 'error', mailError: e?.message || 'Gönderilemedi.' });
              }
            },
            (done, total) => setBar({ done, total })
          );
        }
      }
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Görevler gönderilemedi.');
      setPhase('done');
    } finally {
      setProgress('');
      setBar(null);
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
      description={`Yalnız sizin görevleriniz · ${single ? students[0].name : students.length ? `${students.length} öğrenci` : 'Öğrenci seçilmedi'} · ${weekRangeLabel(weekStart)}`}
      footer={
        phase === 'form' ? (
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onClose(false)}>
              Vazgeç
            </button>
            <button type="button" id="plan-send-run" className="ui-btn ui-btn-primary" disabled={students.length === 0} onClick={run}>
              <Send className="w-4 h-4" /> {askTarget ? (students.length ? `${students.length} öğrenciye gönder` : 'Önce seçim yapın') : 'Gönder'}
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
          {askTarget && (
            <div className="space-y-1.5" id="plan-send-classes">
              <PlanTargetPicker
                idPrefix="plan-send"
                question="Kime gönderilsin?"
                classRows={target.classRows}
                state={target.state}
                setState={target.setState}
                sentSet={sentSet}
              />
              <p className="text-[11px] text-muted" id="plan-send-mine-note">
                {students.length ? `Seçilen ${students.length} öğrenciye` : 'Seçtiğiniz öğrencilere'} yalnız sizin görevleriniz gider. Diğer öğretmenlerin görevleri onların
                gönderimine bağlıdır. Seçilmeyenlerde görevleriniz taslak kalır; sonra gönderebilirsiniz.
              </p>
            </div>
          )}
          <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 opacity-90">
            <input type="checkbox" checked disabled className="mt-0.5 w-4 h-4" />
            <span className="text-sm">
              <span className="font-semibold text-fg">Öğrencinin uygulamasında göster ve Soru Kaydet'e aktar</span>
              <span className="block text-[11px] text-muted">
                Öğrenci ana sayfasında her gün "Bugün yapılması gerekenler" olarak görür ve işaretler. Görevler Soru Kaydet bölümünde ilgili günün ders satırına
                kendiliğinden yazılır; soru sayıları gün gün soru hedefine eklenir.
              </span>
            </span>
          </label>
          <label className={cx('flex items-start gap-2.5 cursor-pointer rounded-xl border px-3 py-2.5', mail ? 'border-brand bg-brand-soft/40' : 'border-line')}>
            <input type="checkbox" id="plan-send-mail" checked={mail} onChange={(e) => setMail(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]" />
            <span className="text-sm">
              <span className="font-semibold text-fg inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" /> E-posta ile de gönder (PDF ekli)
              </span>
              <span className="block text-[11px] text-muted">
                Yalnız sizin görevleriniz yazılır; e-postanın içinde ve PDF eki olarak gider. Öğrenci e-postadaki kişisel bağlantıdan görevlerini "yaptım" diye işaretleyebilir; işaretler sisteme kaydedilir.
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
                Gönderdikten sonra her öğrenci için bir WhatsApp düğmesi çıkar; tıklayınca sizin görevlerinizin özeti ve işaretleme bağlantısı hazır mesaj olarak açılır, siz gönderirsiniz. Telefonu kayıtlı değilse kişiyi WhatsApp'ta siz seçersiniz.
              </span>
            </span>
          </label>
          {!mail && <p className="text-[11px] text-muted">E-posta seçilmezse öğretmene otomatik rapor gönderilmez.</p>}
        </div>
      ) : (
        <div className="space-y-3" id="plan-send-result">
          {progress && (
            <div className="space-y-1.5" role="status" id="plan-send-progress">
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
            <div role="alert" id="plan-send-error" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
              {error}
            </div>
          )}
          {phase === 'done' && !error && (
            <div className="rounded-xl bg-success-soft text-success-fg px-3 py-2 text-sm font-semibold" id="plan-send-summary">
              Görevleriniz {rows.length === 1 ? 'öğrenciye' : `${rows.length} öğrenciye`} gönderildi; uygulamada görünüyor.
              {transferred > 0 ? ` Görevler ${transferred} öğrencinin Soru Kaydet bölümüne de aktarıldı.` : ''}
              {transferredQ > 0 ? ` Plandaki ${transferredQ} soru, öğrencilerin gün gün soru hedeflerine eklendi.` : ''}
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
