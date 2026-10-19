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
import { dataService } from '../../services/dataService';
import { transferPlanTopicsToQuestionEntry } from '../../lib/planToTarget';

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
  /** Aşama 35: verilirse gönderimden sonra görevler öğrencinin Soru Kaydet formuna da aktarılır (öğretmenin yetkili olduğu dersler) */
  canSubject?: (subject: string) => boolean;
  /** Aşama 52: gönderilecek sınıflar pencerede sorulur (sınıf görünümü) */
  pickClasses?: boolean;
  /** Aşama 52: sınıf mevcutları (tüm sınıf seçilince sınıf karnesi için) */
  classSizes?: Record<string, number>;
  /** Aşama 52: planı daha önce gönderilmiş öğrenciler (sınıf satırında bilgi olarak gösterilir) */
  sentIds?: string[];
  onClose: (changed: boolean) => void;
}

export const StudyPlanSendModal: React.FC<StudyPlanSendModalProps> = ({
  weekStart,
  students: allStudents,
  classes,
  kind: kindProp,
  classId: classIdProp,
  teacherName,
  title,
  canSubject,
  pickClasses,
  classSizes,
  sentIds,
  onClose,
}) => {
  // ---- Aşama 52: sınıf seçimi
  const classGroups = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of allStudents) {
      const k = s.classId || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    const nameOf = (cid: string) => classes.find((c) => c.id === cid)?.name || m.get(cid)?.[0]?.className || 'Sınıfsız';
    return Array.from(m.entries())
      .map(([cid, list]) => ({ cid, name: nameOf(cid), list }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }, [allStudents, classes]);
  const askClasses = !!pickClasses && allStudents.length > 1;
  const sentSet = useMemo(() => new Set(sentIds || []), [sentIds]);
  // Tek sınıf varsa seçili gelir; birden çok sınıf varsa öğretmen seçer
  const [chosen, setChosen] = useState<Set<string>>(() => (classGroups.length === 1 ? new Set([classGroups[0].cid]) : new Set()));
  const toggleClass = (cid: string) =>
    setChosen((cur) => {
      const n = new Set(cur);
      if (n.has(cid)) n.delete(cid);
      else n.add(cid);
      return n;
    });
  const students = useMemo(() => (askClasses ? allStudents.filter((s) => chosen.has(s.classId || '')) : allStudents), [askClasses, allStudents, chosen]);
  const { kind, classId } = useMemo((): { kind: PlanGroupKind; classId?: string } => {
    if (!askClasses) return { kind: kindProp, classId: classIdProp };
    if (students.length <= 1) return { kind: 'student' };
    const cids = Array.from(chosen);
    if (cids.length === 1 && classSizes && classSizes[cids[0]] === students.length) return { kind: 'class', classId: cids[0] };
    return { kind: 'students' };
  }, [askClasses, kindProp, classIdProp, students, chosen, classSizes]);

  const withEmail = useMemo(() => students.filter((s) => isEmail(s.email)).length, [students]);
  const [mail, setMail] = useState(false);
  const [wa, setWa] = useState(false);
  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [progress, setProgress] = useState('');
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
      // Aşama 43: öğrencinin soru haftası bu planın başladığı günden başlasın
      void dataService.syncPlanWeekStarts();
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
        setProgress(mail ? `E-posta gönderiliyor (${i + 1}/${list.length})…` : `Soru Kaydet'e aktarılıyor (${i + 1}/${list.length})…`);
        const p = await loadPlan(st.id, weekStart).catch(() => ({ header: null, items: [] as PlanItem[] }));
        patchRow(st.id, { items: p.items, link: links[st.id] });
        list[i] = { ...list[i], items: p.items, link: links[st.id] };
        // Aşama 35: görevler Soru Kaydet → "Çalışılan Konu / Test" kutusuna da aktarılır (hata gönderimi durdurmaz)
        if (canSubject && p.items.length) {
          try {
            const t = await transferPlanTopicsToQuestionEntry({ student: st, weekStart, items: p.items, canSubject });
            if (t.subjects.length) setTransferred((n) => n + 1);
            if (t.questionTotal) setTransferredQ((n) => n + t.questionTotal);
          } catch {
            /* aktarılamazsa öğretmen "Soru Kaydet'e aktar" düğmesiyle tekrar deneyebilir */
          }
        }
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
      description={`${single ? students[0].name : students.length ? `${students.length} öğrenci` : 'Sınıf seçilmedi'} · ${weekRangeLabel(weekStart)}`}
      footer={
        phase === 'form' ? (
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onClose(false)}>
              Vazgeç
            </button>
            <button type="button" id="plan-send-run" className="ui-btn ui-btn-primary" disabled={students.length === 0} onClick={run}>
              <Send className="w-4 h-4" /> {askClasses ? (students.length ? `${students.length} öğrenciye gönder` : 'Önce sınıf seçin') : 'Gönder'}
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
          {askClasses && (
            <div className="rounded-xl border border-brand/30 bg-brand-soft/30 px-3 py-2.5 space-y-2" id="plan-send-classes">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-fg">Hangi sınıflara ödev olarak gönderilsin?</p>
                {classGroups.length > 1 && (
                  <button
                    type="button"
                    id="plan-send-classes-all"
                    className="ui-btn ui-btn-ghost ui-btn-sm"
                    onClick={() => setChosen(chosen.size === classGroups.length ? new Set() : new Set(classGroups.map((g) => g.cid)))}
                  >
                    {chosen.size === classGroups.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gönderilecek sınıflar">
                {classGroups.map((g) => {
                  const on = chosen.has(g.cid);
                  const sentN = g.list.filter((s) => sentSet.has(s.id)).length;
                  return (
                    <button
                      key={g.cid || 'none'}
                      type="button"
                      data-send-class={g.cid}
                      aria-pressed={on}
                      onClick={() => toggleClass(g.cid)}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer',
                        on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-fg-2 hover:border-brand/50'
                      )}
                    >
                      {on && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {g.name}
                      <span className={cx('text-[10px] font-bold', on ? 'text-white/80' : 'text-muted')}>
                        {g.list.length} öğr.{sentN ? ` · ${sentN} gönderildi` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted">
                Yalnızca seçtiğiniz sınıfların öğrencileri planı görür ve görevler onların Soru Kaydet bölümüne aktarılır. Diğer sınıflar taslak kalır; sonra
                gönderebilirsiniz.
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
