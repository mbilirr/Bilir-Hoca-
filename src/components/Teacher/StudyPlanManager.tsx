import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FileSpreadsheet,
  Library,
  Plus,
  Send,
  Trash2,
  Undo2,
  Users,
  AlertCircle,
  FileText,
} from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import {
  PLAN_DAYS,
  addBook,
  addDaysYmd,
  addPlanItem,
  applyPlan,
  dateOfDay,
  deleteBook,
  deletePlan,
  deletePlanItem,
  listBooks,
  loadPlan,
  sendPlan,
  shortDayLabel,
  unsendPlan,
  updatePlanItem,
  weekRangeLabel,
  weekStartOf,
  ymd,
  type ApplyResult,
  type PlanItem,
  type PlanItemDraft,
  type StudentBook,
  type StudyPlan,
} from '../../services/studyPlanService';
import { subjectsForLevel } from '../../lib/subjects';
import { cx, EmptyState, Modal, Panel, Segmented } from '../ui/kit';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { FieldLabel, StudentPicker, classLevel, inputCls, chipCls } from './FormParts';
import { StudyPlanTaskModal } from './StudyPlanTaskModal';
import { StudyPlanSendModal } from './StudyPlanSendModal';
import type { PlanGroupKind } from '../../services/studyPlanService';
import { StudyPlanClassView } from './StudyPlanClassView';
import { User as UserIcon, School } from 'lucide-react';

// ============================================================================
// Haftalık çalışma planı (Aşama 19) — Ödevler bölümünün "Haftalık Plan" sekmesi
//  * Öğrenci + hafta seçilir; haftanın 7 günü için görev tanımlanır (ders → kitap → açıklama).
//  * Yönetici her dersten, öğretmen yalnız kendi branşından görev verir.
//  * Plan öğrenciye ödev olarak gönderilir, PDF / Excel olarak indirilir, başka öğrencilere/haftalara uygulanır.
// ============================================================================

const SUBJECT_TONES = [
  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25',
  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
  'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
  'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25',
  'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25',
  'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25',
];
export const subjectTone = (subject: string) => {
  let h = 0;
  for (const ch of subject) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_TONES[h % SUBJECT_TONES.length];
};

const STORE_KEY = 'edu_plan_student_v1';
const MODE_KEY = 'edu_plan_mode_v1';
const readMode = (): 'student' | 'class' => {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'class' ? 'class' : 'student';
  } catch {
    return 'student';
  }
};
const readSaved = () => {
  try {
    return sessionStorage.getItem(STORE_KEY) || '';
  } catch {
    return '';
  }
};
const writeSaved = (id: string) => {
  try {
    sessionStorage.setItem(STORE_KEY, id);
  } catch {
    /* sessionStorage yoksa seçim hatırlanmaz */
  }
};

type Notice = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string };

interface Props {
  students: Student[];
  classes: ClassGroup[];
}

export const StudyPlanManager: React.FC<Props> = ({ students, classes }) => {
  const me = dataService.getCurrentTeacher();
  const isAdmin = dataService.isCurrentUserAdmin();
  const mySubjects = dataService.getMySubjects(); // null = tüm dersler
  const teacherName = me?.name || 'Öğretmen';
  const canSubject = useCallback((s: string) => isAdmin || !mySubjects || mySubjects.includes(s), [isAdmin, mySubjects]);

  // Aşama 23: Kime? Öğrenci (tek öğrencinin planı) / Sınıf (bir ya da birden çok sınıf, seçili öğrenciler)
  const [mode, setMode] = useState<'student' | 'class'>(readMode);
  useEffect(() => {
    try {
      sessionStorage.setItem(MODE_KEY, mode);
    } catch {
      /* hatırlanmaz */
    }
  }, [mode]);

  // ---- öğrenci / hafta seçimi
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => (a.className || '').localeCompare(b.className || '', 'tr', { numeric: true }) || a.name.localeCompare(b.name, 'tr')),
    [students]
  );
  const [classFilter, setClassFilter] = useState('all');
  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) if (s.classId && !seen.has(s.classId)) seen.set(s.classId, classes.find((c) => c.id === s.classId)?.name || s.className || s.classId);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr', { numeric: true }));
  }, [students, classes]);
  const listed = useMemo(() => sortedStudents.filter((s) => classFilter === 'all' || s.classId === classFilter), [sortedStudents, classFilter]);
  const [studentId, setStudentId] = useState<string>(() => {
    const saved = readSaved();
    return saved && students.some((s) => s.id === saved) ? saved : '';
  });
  useEffect(() => {
    // Seçili öğrenci listede yoksa ilk öğrenciyi seç
    if (!listed.length) return;
    if (!studentId || !students.some((s) => s.id === studentId)) setStudentId(listed[0].id);
    else if (!listed.some((s) => s.id === studentId)) setStudentId(listed[0].id);
  }, [listed, students, studentId]);
  useEffect(() => {
    if (studentId) writeSaved(studentId);
  }, [studentId]);
  const student = students.find((s) => s.id === studentId) || null;
  const studentClass = student ? classes.find((c) => c.id === student.classId) : undefined;

  const todayStr = ymd(new Date());
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));

  // ---- plan ve kitaplar
  const [plan, setPlan] = useState<StudyPlan>({ header: null, items: [] });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [books, setBooks] = useState<StudentBook[]>([]);
  const seq = useRef(0);

  const reload = useCallback(
    async (quiet = false) => {
      if (!studentId || mode === 'class') return;
      const my = ++seq.current;
      if (!quiet) setLoading(true);
      try {
        const [p, b] = await Promise.all([loadPlan(studentId, weekStart), listBooks(studentId).catch(() => null)]);
        if (my !== seq.current) return;
        setPlan(p);
        if (b) setBooks(b);
        setLoadError(null);
      } catch (e: any) {
        if (my !== seq.current) return;
        setLoadError(e?.message || 'Plan okunamadı.');
        setPlan({ header: null, items: [] });
      } finally {
        if (my === seq.current && !quiet) setLoading(false);
      }
    },
    [studentId, weekStart, mode]
  );
  useEffect(() => {
    setPlan({ header: null, items: [] });
    void reload();
  }, [reload]);
  // Başka sekmeden dönünce (öğrenci "yaptım" işaretlemiş olabilir) tazele
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reload]);

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const say = (n: Notice, ms = 6000) => {
    setNotice(n);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), ms);
  };
  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    []
  );

  // ---- görev ekleme / düzenleme
  const subjectOptions = useMemo(() => {
    const base = subjectsForLevel(classLevel(studentClass));
    let list = isAdmin || !mySubjects ? base : mySubjects;
    if (!isAdmin && mySubjects) list = Array.from(new Set(mySubjects));
    return list;
  }, [studentClass, isAdmin, mySubjects]);
  const [taskModal, setTaskModal] = useState<{ mode: 'add' | 'edit'; item?: PlanItem; day: number } | null>(null);
  const taskInitial: PlanItemDraft = taskModal?.item
    ? { day: taskModal.item.day, subject: taskModal.item.subject, book: taskModal.item.book, note: taskModal.item.note }
    : { day: taskModal?.day ?? 0, subject: subjectOptions[0] || '', book: '', note: '' };
  const subjectOptionsForModal = useMemo(
    () => (taskModal?.item && !subjectOptions.includes(taskModal.item.subject) ? [taskModal.item.subject, ...subjectOptions] : subjectOptions),
    [taskModal, subjectOptions]
  );

  const saveTask = async (draft: PlanItemDraft, keepOpen: boolean) => {
    if (!student) return;
    // Kitap öğrencinin listesinde yoksa eklenir (sonraki planlarda açılır listede çıkar)
    if (draft.book) {
      const known = books.some((b) => b.title.toLocaleLowerCase('tr-TR') === draft.book.toLocaleLowerCase('tr-TR'));
      if (!known) {
        try {
          const nb = await addBook(student.id, draft.book, draft.subject, books);
          setBooks((prev) => (prev.some((x) => x.id === nb.id) ? prev : [...prev, nb].sort((a, b) => a.title.localeCompare(b.title, 'tr'))));
        } catch {
          /* kitap listesine yazılamazsa görev yine kaydedilir */
        }
      }
    }
    if (taskModal?.mode === 'edit' && taskModal.item) {
      const updated = await updatePlanItem(taskModal.item.id, draft);
      setPlan((p) => ({ ...p, items: p.items.map((i) => (i.id === updated.id ? { ...updated, doneAt: i.doneAt } : i)) }));
      setTaskModal(null);
      say({ tone: 'success', text: 'Görev güncellendi.' }, 3000);
      return;
    }
    const position = plan.items.filter((i) => i.day === draft.day).reduce((m, i) => Math.max(m, i.position + 1), 0);
    const created = await addPlanItem(student.id, weekStart, draft, position, teacherName);
    setPlan((p) => ({ header: p.header || { id: `plan-${student.id}-${weekStart}`, studentId: student.id, weekStart, sentAt: null, sentByName: '' }, items: [...p.items, created] }));
    if (keepOpen) setTaskModal((m) => (m ? { ...m, day: draft.day } : m));
    else {
      setTaskModal(null);
      say({ tone: 'success', text: 'Görev eklendi.' }, 3000);
    }
  };

  const [deleteItem, setDeleteItem] = useState<PlanItem | null>(null);
  const confirmDeleteItem = async () => {
    const it = deleteItem;
    setDeleteItem(null);
    if (!it) return;
    try {
      await deletePlanItem(it.id);
      setPlan((p) => ({ ...p, items: p.items.filter((i) => i.id !== it.id) }));
      say({ tone: 'success', text: 'Görev silindi.' }, 3000);
    } catch (e: any) {
      say({ tone: 'danger', text: e?.message || 'Görev silinemedi.' });
    }
  };

  // ---- gönder / geri çek / sil
  const sent = !!plan.header?.sentAt;
  const doneCount = plan.items.filter((i) => i.doneAt).length;
  const [busy, setBusy] = useState(false);
  // Aşama 22: gönderme penceresi (uygulama + isteğe bağlı e-posta / WhatsApp)
  const [sendModal, setSendModal] = useState<{ students: Student[]; kind: PlanGroupKind; classId?: string; weekStart: string; title?: string } | null>(null);
  const doSend = () => {
    if (!student || busy) return;
    setSendModal({ students: [student], kind: 'student', weekStart });
  };
  const doUnsend = async () => {
    if (!student || busy) return;
    setBusy(true);
    try {
      const h = await unsendPlan(student.id, weekStart);
      setPlan((p) => ({ ...p, header: h }));
      say({ tone: 'info', text: 'Plan geri çekildi; öğrenci artık görmüyor.' });
    } catch (e: any) {
      say({ tone: 'danger', text: e?.message || 'Plan geri çekilemedi.' });
    } finally {
      setBusy(false);
    }
  };
  const [confirmClear, setConfirmClear] = useState(false);
  const doClear = async () => {
    setConfirmClear(false);
    if (!student) return;
    try {
      // Önce kendi yetkisindeki görevleri siler; yönetici planın tamamını siler
      if (isAdmin || plan.items.every((i) => canSubject(i.subject))) await deletePlan(student.id, weekStart);
      else for (const i of plan.items.filter((x) => canSubject(x.subject))) await deletePlanItem(i.id);
      await reload(true);
      say({ tone: 'success', text: 'Plan temizlendi.' }, 3000);
    } catch (e: any) {
      say({ tone: 'danger', text: e?.message || 'Plan silinemedi.' });
    }
  };

  // ---- dışa aktarma
  const exportCtx = () => ({ studentName: student?.name || '', className: student?.className || studentClass?.name, weekStart, items: plan.items, showStatus: sent });
  const doExport = async (kind: 'pdf' | 'excel') => {
    if (!student || !plan.items.length || busy) return;
    setBusy(true);
    try {
      const mod = await import('../../lib/studyPlanExport');
      if (kind === 'pdf') await mod.downloadPlanPdf(exportCtx());
      else await mod.downloadPlanExcel(exportCtx());
    } catch (e: any) {
      say({ tone: 'danger', text: `Dosya hazırlanamadı. ${e?.message || ''}`.trim() });
    } finally {
      setBusy(false);
    }
  };

  // ---- başkalarına uygula
  const [applyOpen, setApplyOpen] = useState(false);
  const [booksOpen, setBooksOpen] = useState(false);

  const shiftWeek = (delta: number) => setWeekStart((w) => addDaysYmd(w, delta * 7));
  const isThisWeek = weekStart === weekStartOf(new Date());

  if (!students.length) {
    return (
      <Panel id="study-plan">
        <EmptyState icon={Users} title="Plan hazırlanacak öğrenci yok" description="Önce öğrenci eklenmeli ya da size öğrenci/sınıf yetkisi verilmeli." />
      </Panel>
    );
  }

  const itemsByDay = Array.from({ length: 7 }, (_, d) => plan.items.filter((i) => i.day === d));

  const weekNav = (
    <div className="flex items-end gap-2">
      <button type="button" id="plan-week-prev" aria-label="Önceki hafta" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => shiftWeek(-1)}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="min-w-[10.5rem] text-center">
        <p className="text-[11px] text-muted font-medium">{isThisWeek ? 'Bu hafta' : weekStart > weekStartOf(new Date()) ? 'Gelecek' : 'Geçmiş hafta'}</p>
        <p id="plan-week-label" className="text-sm font-bold text-fg">
          {weekRangeLabel(weekStart)}
        </p>
      </div>
      <button type="button" id="plan-week-next" aria-label="Sonraki hafta" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => shiftWeek(1)}>
        <ChevronRight className="w-4 h-4" />
      </button>
      {!isThisWeek && (
        <button type="button" id="plan-week-today" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setWeekStart(weekStartOf(new Date()))}>
          Bu hafta
        </button>
      )}
      <input
        type="date"
        aria-label="Haftayı tarihle seç"
        id="plan-week-date"
        value={weekStart}
        onChange={(e) => e.target.value && setWeekStart(weekStartOf(e.target.value))}
        className={cx(inputCls, 'w-[9.5rem] hidden md:block')}
      />
    </div>
  );
  const modeSwitch = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted">Kime:</span>
      <Segmented
        size="sm"
        value={mode}
        onChange={setMode}
        items={[
          { value: 'student', label: 'Öğrenci', icon: UserIcon, id: 'plan-mode-student' },
          { value: 'class', label: 'Sınıf', icon: School, id: 'plan-mode-class' },
        ]}
      />
      <span className="text-[11px] text-muted hidden sm:inline">
        {mode === 'class' ? 'Bir ya da birden çok sınıfa, istediğiniz öğrencilere birlikte plan verin.' : 'Tek öğrencinin planı.'}
      </span>
    </div>
  );

  if (mode === 'class') {
    return <StudyPlanClassView students={students} classes={classes} weekStart={weekStart} onWeekChange={setWeekStart} weekNav={weekNav} modeSwitch={modeSwitch} />;
  }

  return (
    <div id="study-plan" className="space-y-4">
      {/* Üst çubuk: öğrenci + hafta */}
      <div className="ui-card ui-card-pad space-y-3">
        {modeSwitch}
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="grid sm:grid-cols-2 gap-3 flex-1 min-w-0">
            <div>
              <FieldLabel htmlFor="plan-class-filter">Sınıf</FieldLabel>
              <select id="plan-class-filter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={inputCls}>
                <option value="all">Tüm sınıflar</option>
                {classOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="plan-student">Öğrenci</FieldLabel>
              <select id="plan-student" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputCls}>
                {listed.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {classFilter === 'all' && s.className ? ` · ${s.className}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {weekNav}
        </div>

        {/* Durum ve işlemler */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1 border-t border-line">
          <div className="flex flex-wrap items-center gap-2 pt-2" id="plan-status">
            {sent ? (
              <span className="ui-chip ui-chip-success" id="plan-status-sent">
                <Check className="w-3.5 h-3.5" /> Öğrenciye gönderildi
              </span>
            ) : (
              <span className="ui-chip ui-chip-neutral" id="plan-status-draft">
                Taslak · öğrenci henüz görmüyor
              </span>
            )}
            {sent && plan.header?.mailedAt && (
              <span className="ui-chip ui-chip-info" id="plan-status-mailed" title="Son görev günü 20:00'de size rapor e-postası gelir">
                E-postayla gönderildi
              </span>
            )}
            {sent && plan.items.length > 0 && (
              <span className="ui-chip ui-chip-info" id="plan-progress">
                {doneCount} / {plan.items.length} görev yapıldı
              </span>
            )}
            <span className="text-xs text-muted">{plan.items.length} görev</span>
            {student && !student.auth_user_id && (
              <span className="inline-flex items-center gap-1 text-[11px] text-warning-fg font-semibold" id="plan-no-account">
                <AlertCircle className="w-3.5 h-3.5" /> Bu öğrencinin giriş hesabı görünmüyor; PDF/Excel ile verebilirsiniz.
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sent ? (
              <>
                <button
                  type="button"
                  id="plan-resend"
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                  disabled={busy}
                  onClick={() => student && setSendModal({ students: [student], kind: 'student', weekStart, title: 'E-posta / WhatsApp ile gönder' })}
                >
                  <Send className="w-4 h-4" /> E-posta / WhatsApp
                </button>
                <button type="button" id="plan-unsend" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy} onClick={doUnsend}>
                  <Undo2 className="w-4 h-4" /> Geri çek
                </button>
              </>
            ) : (
              <button type="button" id="plan-send" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || plan.items.length === 0} onClick={doSend}>
                <Send className="w-4 h-4" /> Öğrenciye ödev olarak gönder
              </button>
            )}
            <button type="button" id="plan-pdf" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || plan.items.length === 0} onClick={() => doExport('pdf')}>
              <FileText className="w-4 h-4" /> PDF
            </button>
            <button type="button" id="plan-excel" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || plan.items.length === 0} onClick={() => doExport('excel')}>
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button type="button" id="plan-apply" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={plan.items.length === 0} onClick={() => setApplyOpen(true)}>
              <Copy className="w-4 h-4" /> Başkalarına / başka haftaya uygula
            </button>
            <button type="button" id="plan-books" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setBooksOpen(true)}>
              <Library className="w-4 h-4" /> Kitaplar ({books.length})
            </button>
            {plan.items.length > 0 && (
              <button type="button" id="plan-clear" className="ui-btn ui-btn-ghost ui-btn-sm text-danger-fg" onClick={() => setConfirmClear(true)}>
                <Trash2 className="w-4 h-4" /> Planı temizle
              </button>
            )}
          </div>
        </div>
        {sent && <p className="text-[11px] text-muted">Gönderilmiş planda yaptığınız değişiklikler öğrencide anında görünür.</p>}
      </div>

      {/* Aşama 23: taslak planda gönder düğmesi daha görünür */}
      {!sent && plan.items.length > 0 && !loading && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-xl border border-warning/40 bg-warning-soft px-4 py-3" id="plan-draft-callout">
          <p className="text-sm text-warning-fg font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Plan taslak: öğrenci henüz görmüyor. Görmesi için "Öğrenciye ödev olarak gönder"e basın.
          </p>
          <button type="button" id="plan-send-callout" className="ui-btn ui-btn-primary ui-btn-sm shrink-0" disabled={busy} onClick={doSend}>
            <Send className="w-4 h-4" /> Öğrenciye ödev olarak gönder
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          id="plan-notice"
          className={cx(
            'flex items-start gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold',
            notice.tone === 'success' && 'bg-success-soft text-success-fg border-success/30',
            notice.tone === 'warning' && 'bg-warning-soft text-warning-fg border-warning/30',
            notice.tone === 'danger' && 'bg-danger-soft text-danger-fg border-danger/30',
            notice.tone === 'info' && 'bg-info-soft text-info-fg border-info/30'
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Kapat" className="px-1 cursor-pointer" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      {loadError && (
        <div role="alert" id="plan-load-error" className="px-4 py-3 rounded-xl border border-danger/30 bg-danger-soft text-danger-fg text-xs font-semibold">
          {loadError}
        </div>
      )}

      {/* Haftanın 7 günü */}
      <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', loading && 'opacity-60 transition-opacity')} id="plan-days" aria-busy={loading}>
        {itemsByDay.map((list, d) => {
          const date = dateOfDay(weekStart, d);
          const isToday = date === todayStr;
          return (
            <section
              key={d}
              data-day={d}
              className={cx('ui-card flex flex-col min-h-[9rem]', isToday && 'ring-2 ring-brand/50 border-brand/50')}
              aria-label={`${PLAN_DAYS[d]} görevleri`}
            >
              <header className={cx('flex items-center justify-between gap-2 px-3 py-2 border-b border-line rounded-t-2xl', isToday ? 'bg-brand-soft' : 'bg-surface-2/60')}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-fg leading-tight">
                    {PLAN_DAYS[d]}
                    {isToday && <span className="ml-1.5 text-[10px] font-bold text-brand-fg uppercase">bugün</span>}
                  </p>
                  <p className="text-[11px] text-muted">{shortDayLabel(date)}</p>
                </div>
                <button
                  type="button"
                  id={`plan-add-${d}`}
                  aria-label={`${PLAN_DAYS[d]} gününe görev ekle`}
                  title="Görev ekle"
                  className="ui-btn ui-btn-primary ui-btn-icon ui-btn-sm"
                  onClick={() => setTaskModal({ mode: 'add', day: d })}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </header>
              <div className="flex-1 p-2 space-y-2">
                {list.length === 0 && <p className="text-xs text-subtle px-1 py-2">Görev yok</p>}
                {list.map((it) => {
                  const editable = canSubject(it.subject);
                  return (
                    <article key={it.id} data-plan-item={it.id} data-subject={it.subject} className="rounded-xl border border-line bg-surface p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className={cx('inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold', subjectTone(it.subject))}>{it.subject}</span>
                        <span className="flex items-center gap-0.5 shrink-0">
                          {it.doneAt && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success-fg mr-1" data-done title="Öğrenci yaptı olarak işaretledi">
                              <Check className="w-3 h-3" /> Yaptı
                            </span>
                          )}
                          {editable && (
                            <>
                              <button type="button" aria-label="Görevi düzenle" title="Düzenle" data-edit className="p-1 rounded-md text-muted hover:text-fg hover:bg-surface-2 cursor-pointer" onClick={() => setTaskModal({ mode: 'edit', item: it, day: it.day })}>
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" aria-label="Görevi sil" title="Sil" data-delete className="p-1 rounded-md text-muted hover:text-danger-fg hover:bg-danger-soft cursor-pointer" onClick={() => setDeleteItem(it)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      {it.book && (
                        <p className="flex items-start gap-1.5 text-xs font-semibold text-fg">
                          <BookOpen className="w-3.5 h-3.5 shrink-0 mt-px text-muted" />
                          <span className="min-w-0 break-words">{it.book}</span>
                        </p>
                      )}
                      {it.note && <p className="text-xs text-fg-2 whitespace-pre-wrap break-words">{it.note}</p>}
                      {it.createdByName && <p className="text-[10px] text-subtle">{it.createdByName}</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Pencereler */}
      <StudyPlanTaskModal
        open={!!taskModal}
        mode={taskModal?.mode || 'add'}
        weekStart={weekStart}
        initial={taskInitial}
        subjectOptions={subjectOptionsForModal}
        books={books}
        studentName={student ? `${student.name}${student.className ? ` · ${student.className}` : ''} — ${weekRangeLabel(weekStart)}` : ''}
        onClose={() => setTaskModal(null)}
        onSave={saveTask}
      />
      <ConfirmDeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDeleteItem}
        title="Görev silinsin mi?"
        description="Bu görev plandan kaldırılır. Öğrenciye gönderilmiş planda öğrencinin ekranından da kalkar."
        itemBadge={deleteItem ? `${deleteItem.subject}${deleteItem.book ? ` · ${deleteItem.book}` : ''}` : undefined}
      />
      <ConfirmDeleteModal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={doClear}
        title="Haftanın planı temizlensin mi?"
        description={
          isAdmin || plan.items.every((i) => canSubject(i.subject))
            ? 'Bu haftanın tüm görevleri silinir. Bu işlem geri alınamaz.'
            : 'Yalnızca sizin branşınızdaki görevler silinir; diğer öğretmenlerin görevlerine dokunulmaz.'
        }
        confirmButtonText="Evet, temizle"
      />
      {applyOpen && student && (
        <ApplyPlanModal
          sourceStudent={student}
          sourceWeek={weekStart}
          items={plan.items}
          students={sortedStudents}
          classes={classes}
          canSubject={canSubject}
          senderName={teacherName}
          onClose={(refresh) => {
            setApplyOpen(false);
            if (refresh) void reload(true);
          }}
          onDispatch={(d) => {
            setApplyOpen(false);
            void reload(true);
            setSendModal(d);
          }}
        />
      )}
      {sendModal && (
        <StudyPlanSendModal
          weekStart={sendModal.weekStart}
          students={sendModal.students}
          classes={classes}
          kind={sendModal.kind}
          classId={sendModal.classId}
          teacherName={teacherName}
          title={sendModal.title}
          onClose={(changed) => {
            setSendModal(null);
            if (changed) void reload(true);
          }}
        />
      )}
      {booksOpen && student && (
        <BooksModal
          student={student}
          books={books}
          subjectOptions={subjectOptions}
          onChange={setBooks}
          onClose={() => setBooksOpen(false)}
        />
      )}
    </div>
  );
};

// ============================================================================ Planı uygula
const ApplyPlanModal: React.FC<{
  sourceStudent: Student;
  sourceWeek: string;
  items: PlanItem[];
  students: Student[];
  classes: ClassGroup[];
  canSubject: (s: string) => boolean;
  senderName: string;
  onClose: (refresh: boolean) => void;
  onDispatch: (d: { students: Student[]; kind: PlanGroupKind; classId?: string; weekStart: string; title?: string }) => void;
}> = ({ sourceStudent, sourceWeek, items, students, classes, canSubject, senderName, onClose, onDispatch }) => {
  const [weekMode, setWeekMode] = useState<'same' | 'next' | 'custom'>('same');
  const [customDate, setCustomDate] = useState(sourceWeek);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [send, setSend] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const targetWeek = weekMode === 'same' ? sourceWeek : weekMode === 'next' ? addDaysYmd(sourceWeek, 7) : weekStartOf(customDate || sourceWeek);
  const sameWeek = targetWeek === sourceWeek;
  // Aynı haftaya uygularken kaynak öğrenci hedef olamaz
  const targets = selectedIds.filter((id) => !(sameWeek && id === sourceStudent.id));
  // Kaynak öğrenci aynı haftada seçilemesin diye listeden çıkarılır; başka haftada seçilebilir
  const pickable = useMemo(() => (sameWeek ? students.filter((s) => s.id !== sourceStudent.id) : students), [students, sameWeek, sourceStudent.id]);
  const allowedCount = items.filter((i) => canSubject(i.subject)).length;

  // Aşama 22: uygulamadan sonra e-posta / WhatsApp ile gönder (sınıfın tamamıysa toplu karne)
  const openDispatch = () => {
    const ids = new Set(targets);
    let kind: PlanGroupKind = ids.size === 1 ? 'student' : 'students';
    let classId: string | undefined;
    if (classIds.length === 1) {
      const cid = classIds[0];
      const classStudents = students.filter((s) => s.classId === cid);
      // Aynı haftada kaynak öğrenci de o sınıftaysa karneye dahil edilir
      if (sameWeek && sourceStudent.classId === cid) ids.add(sourceStudent.id);
      if (classStudents.length > 0 && classStudents.every((s) => ids.has(s.id))) {
        kind = 'class';
        classId = cid;
      }
    }
    const list = students.filter((s) => ids.has(s.id));
    if (!list.length) return;
    if (list.length === 1) kind = 'student';
    onDispatch({ students: list, kind, classId, weekStart: targetWeek, title: 'E-posta / WhatsApp ile gönder' });
  };

  const run = async () => {
    if (running) return;
    if (targets.length === 0) return setError('En az bir öğrenci seçin (ya da hedef haftayı başka bir haftaya çevirip aynı öğrenciyi seçin).');
    if (allowedCount === 0) return setError('Kopyalanabilecek görev yok: yalnızca kendi branşınızdaki görevler kopyalanır.');
    setRunning(true);
    setError(null);
    try {
      const r = await applyPlan({ items, targetStudentIds: targets, targetWeek, send, senderName, canUseSubject: canSubject });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || 'Plan uygulanamadı.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => onClose(!!result)}
      id="plan-apply-modal"
      icon={Copy}
      tone="brand"
      size="lg"
      title="Planı başkalarına / başka haftaya uygula"
      description={`${sourceStudent.name} · ${weekRangeLabel(sourceWeek)} planındaki ${items.length} görev`}
      footer={
        result ? (
          <button type="button" id="plan-apply-close" className="ui-btn ui-btn-primary" onClick={() => onClose(true)}>
            Tamam
          </button>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onClose(false)}>
              Vazgeç
            </button>
            <button type="button" id="plan-apply-run" className="ui-btn ui-btn-primary" disabled={running} onClick={run}>
              {running ? 'Uygulanıyor…' : `${targets.length || ''} öğrenciye uygula`.trim()}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3" id="plan-apply-result">
          <div className="rounded-xl bg-success-soft text-success-fg px-4 py-3 text-sm font-semibold">
            {result.students} öğrenciye toplam {result.added} görev eklendi{result.skipped ? `, ${result.skipped} görev zaten vardı (atlandı)` : ''}.
            {send ? ' Planlar öğrencilere ödev olarak gönderildi.' : ''}
          </div>
          {result.students > 0 && (
            <div className="rounded-xl border border-line px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                Planı ayrıca e-posta (PDF ekli) veya WhatsApp ile de gönderebilirsiniz. E-postayla gönderilirse son görev günü 20:00'de size
                {classIds.length === 1 ? ' sınıfın toplu karnesi' : ' rapor'} gelir.
              </p>
              <button type="button" id="plan-apply-dispatch" className="ui-btn ui-btn-primary ui-btn-sm" onClick={openDispatch}>
                <Send className="w-4 h-4" /> E-posta / WhatsApp ile gönder
              </button>
            </div>
          )}
          {result.notAllowed > 0 && <p className="text-xs text-muted">Branşınız dışındaki {result.notAllowed} görev kopyalanmadı.</p>}
          {result.failed.length > 0 && (
            <div role="alert" className="rounded-xl bg-danger-soft text-danger-fg px-4 py-3 text-xs space-y-1">
              <p className="font-bold">{result.failed.length} öğrenciye uygulanamadı:</p>
              {result.failed.slice(0, 5).map((f) => (
                <p key={f.studentId}>
                  {students.find((s) => s.id === f.studentId)?.name || f.studentId}: {f.message}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-fg">1. Hangi haftaya?</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" id="apply-week-same" className={chipCls(weekMode === 'same')} onClick={() => setWeekMode('same')}>
                Aynı hafta
              </button>
              <button type="button" id="apply-week-next" className={chipCls(weekMode === 'next')} onClick={() => setWeekMode('next')}>
                Gelecek hafta
              </button>
              <button type="button" id="apply-week-custom" className={chipCls(weekMode === 'custom')} onClick={() => setWeekMode('custom')}>
                Başka hafta
              </button>
              {weekMode === 'custom' && <input type="date" id="apply-week-date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className={cx(inputCls, 'w-44')} />}
            </div>
            <p className="text-xs text-muted" id="apply-week-label">
              Hedef hafta: <strong>{weekRangeLabel(targetWeek)}</strong>
            </p>
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-fg">2. Hangi öğrencilere? (tek öğrenci, birkaç öğrenci ya da sınıfın tamamı)</h3>
            <StudentPicker
              variant="classes"
              classes={classes}
              students={pickable}
              classIds={classIds}
              onClassIdsChange={setClassIds}
              selectedIds={selectedIds}
              onSelectedChange={setSelectedIds}
              idPrefix="plan-apply"
            />
          </section>
          <section className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-line px-3 py-2.5">
              <input type="checkbox" id="apply-send" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]" />
              <span className="text-sm">
                <span className="font-semibold text-fg">Planlar hemen öğrencilere ödev olarak gönderilsin</span>
                <span className="block text-[11px] text-muted">İşaretlemezseniz her öğrencinin planı taslak olarak kalır; sonra tek tek gönderebilirsiniz.</span>
              </span>
            </label>
            <p className="text-[11px] text-muted">
              Hedefte aynı görev zaten varsa tekrar eklenmez. {allowedCount < items.length ? `Yalnızca sizin branşınızdaki ${allowedCount} görev kopyalanır.` : `${allowedCount} görev kopyalanır.`}
            </p>
          </section>
          {error && (
            <div role="alert" id="plan-apply-error" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// ============================================================================ Kitaplar
const BooksModal: React.FC<{
  student: Student;
  books: StudentBook[];
  subjectOptions: string[];
  onChange: (b: StudentBook[]) => void;
  onClose: () => void;
}> = ({ student, books, subjectOptions, onChange, onClose }) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const b = await addBook(student.id, title, subject, books);
      onChange(books.some((x) => x.id === b.id) ? books : [...books, b].sort((x, y) => x.title.localeCompare(y.title, 'tr')));
      setTitle('');
    } catch (e: any) {
      setError(e?.message || 'Kitap eklenemedi.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (b: StudentBook) => {
    try {
      await deleteBook(b.id);
      onChange(books.filter((x) => x.id !== b.id));
    } catch (e: any) {
      setError(e?.message || 'Kitap silinemedi.');
    }
  };
  const groups = useMemo(() => {
    const m = new Map<string, StudentBook[]>();
    for (const b of books) m.set(b.subject || 'Her ders', [...(m.get(b.subject || 'Her ders') || []), b]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [books]);
  return (
    <Modal open onClose={onClose} id="plan-books-modal" icon={Library} tone="info" title="Öğrencinin kitapları" description={student.name} footer={<button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>Kapat</button>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
          <div>
            <FieldLabel htmlFor="book-title">Kitap adı</FieldLabel>
            <input
              id="book-title"
              type="text"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())}
              placeholder="Örn: Palme 8. Sınıf Matematik Soru Bankası"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel htmlFor="book-subject" optional>
              Ders
            </FieldLabel>
            <select id="book-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
              <option value="">Her ders</option>
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button type="button" id="book-add" className="ui-btn ui-btn-primary" disabled={busy || !title.trim()} onClick={add}>
            <Plus className="w-4 h-4" /> Ekle
          </button>
        </div>
        {error && (
          <div role="alert" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
            {error}
          </div>
        )}
        {books.length === 0 ? (
          <p className="text-xs text-muted">Henüz kitap yok. Görev eklerken yazdığınız kitap adları da buraya kaydedilir.</p>
        ) : (
          <div className="space-y-3" id="plan-books-list">
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-subtle mb-1">{group}</p>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {list.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm" data-book={b.title}>
                      <span className="min-w-0 break-words">{b.title}</span>
                      <button type="button" aria-label={`${b.title} kitabını sil`} className="p-1 rounded-md text-muted hover:text-danger-fg hover:bg-danger-soft cursor-pointer" onClick={() => remove(b)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
