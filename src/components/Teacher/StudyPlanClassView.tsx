import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Check, Copy, Edit3, FileSpreadsheet, FileText, Library, Plus, RefreshCw, Send, Target, Trash2, Undo2, Users } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';
import {
  planDayName,
  addBookForStudents,
  addDaysYmd,
  addPlanItemsBulk,
  findPlanConflicts,
  planWeekText,
  applyPlan,
  dateOfDay,
  deletePlanItems,
  listBooksFor,
  loadPlansFor,
  planGroupKey,
  sendPlan,
  shortDayLabel,
  unsendPlans,
  updatePlanItems,
  weekRangeLabel,
  weekStartOf,
  weekStartDayOf,
  ymd,
  type PlanGroupKind,
  type PlanHeader,
  type PlanItem,
  type PlanItemDraft,
  type StudentBook,
} from '../../services/studyPlanService';
import { normalizeSubject, subjectsForLevel } from '../../lib/subjects';
import { cx, EmptyState, Modal } from '../ui/kit';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { FieldLabel, chipCls, classLevel, inputCls } from './FormParts';
import { StudyPlanTaskModal } from './StudyPlanTaskModal';
import { StudyPlanSendModal } from './StudyPlanSendModal';
import { transferPlanTopicsToQuestionEntry } from '../../lib/planToTarget';
import { MultiCheckSelect } from './MultiCheckSelect';
import { subjectTone } from './StudyPlanManager';
import { StudyPlanBooksModal } from './StudyPlanBooksModal';
import { planMainBtnCls, planTileCls, type PlanWeekBarSlots } from './StudyPlanWeekBar';

// ============================================================================
// Haftalık plan — SINIF görünümü (Aşama 23)
//  * Üstte tik kutulu iki açılır liste: sınıflar (bir, birkaç ya da hepsi) ve o sınıfların öğrencileri.
//  * Görev eklerken önce sınıf (istenirse öğrenci tikleri), sonra ders, sonra o dersin kitabı seçilir;
//    aynı gün bir sınıfa bir görev, başka sınıfa başka görev verilebilir.
//  * Aynı görev birden çok öğrencide ayrı satırdır; ekranda tek kart olarak görünür ("8-A · tüm sınıf",
//    "yaptı 12/24"); düzenleme ve silme hepsine birlikte uygulanır.
//  * "Ödev olarak gönder" seçili öğrencilerin hepsinin planını gönderir (e-posta / WhatsApp isteğe bağlı).
// ============================================================================

const CLS_KEY = 'edu_plan_classes_v1';
const EXC_KEY = 'edu_plan_excluded_v1';
const readJson = (k: string): string[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(k) || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};
const writeJson = (k: string, v: string[]) => {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sessionStorage yoksa seçim hatırlanmaz */
  }
};

// Aşama 39: ders adı karşılaştırması (büyük/küçük harf ve Türkçe karakter farkı gözetmez)
const subjKey = (s?: string | null) => normalizeSubject(s || '').toLocaleLowerCase('tr-TR').trim();

type Notice = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string };

interface Group {
  key: string;
  day: number;
  subject: string;
  book: string;
  note: string;
  questionCount: number; // Aşama 43
  createdByName: string;
  position: number;
  items: PlanItem[];
}

interface Props {
  students: Student[];
  classes: ClassGroup[];
  weekStart: string;
  onWeekChange: (w: string) => void;
  /** Hafta + işlem panelini çizer; sağ sütuna bu görünümün durum/işlem düğmeleri verilir. */
  weekNav: (slots: PlanWeekBarSlots) => React.ReactNode;
  modeSwitch: React.ReactNode;
}

export const StudyPlanClassView: React.FC<Props> = ({ students, classes, weekStart, onWeekChange, weekNav, modeSwitch }) => {
  const me = dataService.getCurrentTeacher();
  const isAdmin = dataService.isCurrentUserAdmin();
  const mySubjects = dataService.getMySubjects();
  const teacherName = me?.name || 'Öğretmen';
  const canSubject = useCallback((s: string) => isAdmin || !mySubjects || mySubjects.includes(s), [isAdmin, mySubjects]);
  // Aşama 39: kurum yöneticisi / genel yönetici olmayan öğretmen planda YALNIZCA kendi branşını görür
  const restricted = !isAdmin && !!mySubjects;
  const ownBook = (b: StudentBook) => !restricted || (!!b.subject && (mySubjects || []).some((m) => subjKey(m) === subjKey(b.subject)));

  // ---- sınıf / öğrenci seçimi
  const className = useCallback((cid: string) => classes.find((c) => c.id === cid)?.name || students.find((s) => s.classId === cid)?.className || cid, [classes, students]);
  const classOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of students) if (s.classId) count.set(s.classId, (count.get(s.classId) || 0) + 1);
    return [...count.entries()]
      .map(([id, n]) => ({ id, label: className(id), sub: `${n} öğrenci` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
  }, [students, className]);
  const classTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) if (s.classId) m.set(s.classId, (m.get(s.classId) || 0) + 1);
    return m;
  }, [students]);

  const [classIds, setClassIds] = useState<string[]>(() => {
    const saved = readJson(CLS_KEY).filter((id) => students.some((s) => s.classId === id));
    return saved;
  });
  const [excluded, setExcluded] = useState<string[]>(() => readJson(EXC_KEY));
  useEffect(() => writeJson(CLS_KEY, classIds), [classIds]);
  useEffect(() => writeJson(EXC_KEY, excluded), [excluded]);

  const inClasses = useMemo(
    () =>
      students
        .filter((s) => s.classId && classIds.includes(s.classId))
        .sort((a, b) => className(a.classId).localeCompare(className(b.classId), 'tr', { numeric: true }) || a.name.localeCompare(b.name, 'tr')),
    [students, classIds, className]
  );
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const viewStudents = useMemo(() => inClasses.filter((s) => !excludedSet.has(s.id)), [inClasses, excludedSet]);
  const viewIds = useMemo(() => viewStudents.map((s) => s.id), [viewStudents]);
  const viewKey = viewIds.join(',');
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const nameOfStudent = (id: string) => studentById.get(id)?.name || 'Öğrenci';

  const studentOptions = useMemo(
    () => inClasses.map((s) => ({ id: s.id, label: s.name, sub: s.studentNumber ? `No ${s.studentNumber}` : undefined, group: className(s.classId) })),
    [inClasses, className]
  );
  const onClassesChange = (ids: string[]) => {
    // Yeni eklenen sınıfın öğrencileri seçili gelir
    const added = ids.filter((id) => !classIds.includes(id));
    if (added.length) setExcluded((ex) => ex.filter((sid) => !added.includes(studentById.get(sid)?.classId || '')));
    setClassIds(ids);
  };
  const onStudentsChange = (sel: string[]) => {
    const on = new Set(sel);
    const inIds = inClasses.map((s) => s.id);
    setExcluded((ex) => [...ex.filter((id) => !inIds.includes(id)), ...inIds.filter((id) => !on.has(id))]);
  };

  // ---- planlar
  const [headers, setHeaders] = useState<Record<string, PlanHeader>>({});
  const [items, setItems] = useState<PlanItem[]>([]);
  const [books, setBooks] = useState<StudentBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seq = useRef(0);
  const reload = useCallback(
    async (quiet = false) => {
      const ids = viewKey ? viewKey.split(',') : [];
      const my = ++seq.current;
      if (!ids.length) {
        setHeaders({});
        setItems([]);
        setBooks([]);
        setLoadError(null);
        return;
      }
      if (!quiet) setLoading(true);
      try {
        const [p, b] = await Promise.all([loadPlansFor(ids, weekStart), listBooksFor(ids).catch(() => null)]);
        if (my !== seq.current) return;
        setHeaders(p.headers);
        setItems(p.items);
        if (b) setBooks(b);
        setLoadError(null);
      } catch (e: any) {
        if (my !== seq.current) return;
        setLoadError(e?.message || 'Planlar okunamadı.');
      } finally {
        if (my === seq.current && !quiet) setLoading(false);
      }
    },
    [viewKey, weekStart]
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  // Aşama 44: seçili öğrencilerin bu haftayla ÇAKIŞAN (farklı günde başlayan) planları — uyarı olarak gösterilir;
  // bu öğrencilere bu haftada görev eklenemez (sistem de engeller)
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let alive = true;
    const ids = viewKey ? viewKey.split(',') : [];
    if (!ids.length) {
      setConflicts({});
      return;
    }
    findPlanConflicts(ids, weekStart)
      .then((c) => alive && setConflicts(c))
      .catch(() => alive && setConflicts({}));
    return () => {
      alive = false;
    };
  }, [viewKey, weekStart, items.length]);
  const conflictIds = Object.keys(conflicts);
  const conflictWeeks = Array.from(new Set(conflictIds.flatMap((id) => conflicts[id]))).sort();
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

  // ---- görevleri birleştir (aynı gün + ders + kitap + açıklama = tek kart)
  const viewSet = useMemo(() => new Set(viewIds), [viewIds]);
  const viewItems = useMemo(() => items.filter((i) => viewSet.has(i.studentId)), [items, viewSet]);
  // Aşama 39: ekranda gösterilen görevler (öğretmen: yalnızca kendi branşı). Yetki/aktarım işlemleri tam listeyle yapılır.
  const mySubjectsKey = (mySubjects || []).join('|');
  const shownItems = useMemo(
    () => (restricted ? viewItems.filter((i) => canSubject(i.subject)) : viewItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewItems, restricted, mySubjectsKey]
  );
  const groupsByDay = useMemo(() => {
    const m = new Map<string, Group>();
    for (const it of shownItems) {
      const k = planGroupKey(it);
      const g = m.get(k);
      if (g) {
        g.items.push(it);
        g.position = Math.min(g.position, it.position);
      } else m.set(k, { key: k, day: it.day, subject: it.subject, book: it.book, note: it.note, questionCount: it.questionCount || 0, createdByName: it.createdByName, position: it.position, items: [it] });
    }
    const days: Group[][] = Array.from({ length: 7 }, () => []);
    for (const g of m.values()) days[g.day].push(g);
    days.forEach((list) => list.sort((a, b) => a.position - b.position || a.subject.localeCompare(b.subject, 'tr')));
    return days;
  }, [shownItems]);

  const targetLabel = useCallback(
    (studentIds: string[]) => {
      if (studentIds.length === 1) {
        const s = studentById.get(studentIds[0]);
        return s ? `${s.name}${s.classId ? ` · ${className(s.classId)}` : ''}` : '1 öğrenci';
      }
      const per = new Map<string, number>();
      for (const id of studentIds) {
        const cid = studentById.get(id)?.classId || '';
        per.set(cid, (per.get(cid) || 0) + 1);
      }
      return [...per.entries()]
        .sort((a, b) => className(a[0]).localeCompare(className(b[0]), 'tr', { numeric: true }))
        .map(([cid, n]) => (n === classTotal.get(cid) ? `${className(cid)} · tüm sınıf (${n})` : `${className(cid)} · ${n} öğrenci`))
        .join(', ');
    },
    [studentById, className, classTotal]
  );

  // ---- gönderim durumu
  const withItems = useMemo(() => viewStudents.filter((s) => shownItems.some((i) => i.studentId === s.id)), [viewStudents, shownItems]);
  const sentCount = withItems.filter((s) => headers[s.id]?.sentAt).length;
  const mailedCount = withItems.filter((s) => headers[s.id]?.sentAt && headers[s.id]?.mailedAt).length;
  const anySent = viewStudents.some((s) => headers[s.id]?.sentAt);
  const allSent = withItems.length > 0 && sentCount === withItems.length;

  const [sendModal, setSendModal] = useState<{ students: Student[]; kind: PlanGroupKind; classId?: string; title?: string } | null>(null);
  const openSend = (title?: string) => {
    const list = withItems;
    if (!list.length) return;
    const cids = Array.from(new Set(list.map((s) => s.classId)));
    let kind: PlanGroupKind = list.length === 1 ? 'student' : 'students';
    let classId: string | undefined;
    if (list.length > 1 && cids.length === 1 && classTotal.get(cids[0]) === list.length) {
      kind = 'class';
      classId = cids[0];
    }
    setSendModal({ students: list, kind, classId, title });
  };
  const [busy, setBusy] = useState(false);
  const doUnsend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await unsendPlans(viewIds, weekStart);
      await reload(true);
      say({ tone: 'info', text: `${n} öğrencinin planı geri çekildi; artık görmüyorlar.` });
    } catch (e: any) {
      say({ tone: 'danger', text: e?.message || 'Plan geri çekilemedi.' });
    } finally {
      setBusy(false);
    }
  };

  // ---- Aşama 35: Soru Kaydet'e aktar (seçili öğrencilerin hepsi): plandaki görevlerin metni öğrencinin
  //      "Soru Kaydet → Çalışılan Konu / Test" kutusuna, görevin gününe ve dersine yazılır; soru sayısı yazılmış görevler gün gün soru hedefine aktarılır (Aşama 43).
  const transferable = withItems.filter((s) => viewItems.some((i) => i.studentId === s.id && canSubject(i.subject) && (i.book.trim() || i.note.trim() || i.questionCount > 0)));
  const doTransferToQuestions = async () => {
    if (busy || !transferable.length) return;
    setBusy(true);
    let ok = 0;
    let qTotal = 0;
    const manual = new Set<string>();
    const failed: string[] = [];
    const subjects = new Set<string>();
    try {
      for (const s of transferable) {
        try {
          const r = await transferPlanTopicsToQuestionEntry({ student: s, weekStart, items: viewItems.filter((i) => i.studentId === s.id), canSubject });
          if (r.subjects.length) {
            ok++;
            r.subjects.forEach((x) => subjects.add(x));
          }
          qTotal += r.questionTotal;
          r.manualKept.forEach((x) => manual.add(x));
        } catch {
          failed.push(s.name);
        }
      }
      if (ok) {
        say(
          {
            tone: failed.length ? 'warning' : 'success',
            text: `${[...subjects].join(', ')} görevleri ${ok} öğrencinin "Soru Kaydet → Çalışılan Konu / Test" kutusuna aktarıldı.${qTotal ? ` Soru hedefi olarak ${qTotal} soru aktarıldı.` : ''}${manual.size ? ` ${[...manual].join(', ')}: elle verdiğiniz soru hedefi korundu, plandaki sayılar aktarılmadı.` : ''}${failed.length ? ` Aktarılamayan: ${failed.join(', ')}.` : ''}`,
          },
          8000
        );
      } else {
        say({ tone: 'warning', text: 'Aktarılacak görev yok. Görevlerde kitap, açıklama ya da soru sayısı yazılı olmalı (ve kendi branşınızdan olmalı).' });
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- Aşama 36: Planı yenile — gönderildikten SONRA görev eklendi / değiştirildi / silindiyse:
  //      plan seçili öğrencilere yeniden gönderilir (yeni eklenen öğrenciler de görür) ve
  //      görevler Soru Kaydet → "Çalışılan Konu / Test" kutusuna yeniden aktarılır.
  const doRefresh = async () => {
    if (busy || !withItems.length) return;
    setBusy(true);
    const failed: string[] = [];
    let topics = 0;
    let qTotal = 0;
    const manual = new Set<string>();
    try {
      // Görevi olan öğrenciler + görevi sonradan tamamen çıkarılmış ama planı gönderilmiş öğrenciler
      // (onların Soru Kaydet'teki eski konuları da temizlensin)
      const targets = viewStudents.filter((s) => withItems.includes(s) || headers[s.id]?.sentAt);
      for (const s of targets) {
        const own = viewItems.filter((i) => i.studentId === s.id);
        try {
          if (shownItems.some((i) => i.studentId === s.id)) await sendPlan(s.id, weekStart, teacherName);
          const r = await transferPlanTopicsToQuestionEntry({ student: s, weekStart, items: own, canSubject });
          if (r.subjects.length) topics++;
          qTotal += r.questionTotal;
          r.manualKept.forEach((x) => manual.add(x));
        } catch {
          failed.push(s.name);
        }
      }
      await reload(true);
      void dataService.syncPlanWeekStarts(); // Aşama 43
      say(
        {
          tone: failed.length ? 'warning' : 'success',
          text: `Plan ${withItems.length - failed.length} öğrenciye yeniden gönderildi; ${topics} öğrencinin Soru Kaydet konuları güncellendi.${qTotal ? ` Soru hedefi olarak ${qTotal} soru aktarıldı.` : ''}${manual.size ? ` ${[...manual].join(', ')}: elle verdiğiniz soru hedefi korundu, plandaki sayılar aktarılmadı.` : ''}${failed.length ? ` Yenilenemeyen: ${failed.join(', ')}.` : ''}`,
        },
        8000
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- görev ekle / düzenle
  const subjectOptions = useMemo(() => {
    if (!isAdmin && mySubjects) return Array.from(new Set(mySubjects));
    const levels = Array.from(new Set(classIds.map((cid) => classLevel(classes.find((c) => c.id === cid)))));
    const list: string[] = [];
    for (const lv of levels.length ? levels : ['Ortaokul' as const]) for (const s of subjectsForLevel(lv)) if (!list.includes(s)) list.push(s);
    return list;
  }, [classIds, classes, isAdmin, mySubjects]);

  const [taskModal, setTaskModal] = useState<{ mode: 'add' | 'edit'; day: number; group?: Group } | null>(null);
  const [taskClassIds, setTaskClassIds] = useState<string[]>([]);
  const [taskStudentIds, setTaskStudentIds] = useState<string[]>([]);
  const openAdd = (day: number) => {
    const cids = classIds.filter((cid) => viewStudents.some((s) => s.classId === cid));
    setTaskClassIds(cids);
    setTaskStudentIds(viewStudents.filter((s) => cids.includes(s.classId)).map((s) => s.id));
    setTaskModal({ mode: 'add', day });
  };
  // Aşama 37: düzenlemede sınıf / öğrenci seçicileri görevin ŞU ANKİ öğrencileriyle açılır
  const openEdit = (g: Group) => {
    const sids = Array.from(new Set(g.items.map((i) => i.studentId)));
    const cids = Array.from(new Set(sids.map((id) => studentById.get(id)?.classId || '').filter(Boolean)));
    setTaskClassIds(cids);
    setTaskStudentIds(sids);
    setTaskModal({ mode: 'edit', day: g.day, group: g });
  };
  const toggleTaskClass = (cid: string) => {
    const on = taskClassIds.includes(cid);
    const ids = viewStudents.filter((s) => s.classId === cid).map((s) => s.id);
    setTaskClassIds(on ? taskClassIds.filter((x) => x !== cid) : [...taskClassIds, cid]);
    setTaskStudentIds(on ? taskStudentIds.filter((x) => !ids.includes(x)) : Array.from(new Set([...taskStudentIds, ...ids])));
  };
  const taskStudentOptions = useMemo(
    () => viewStudents.filter((s) => taskClassIds.includes(s.classId)).map((s) => ({ id: s.id, label: s.name, group: className(s.classId) })),
    [viewStudents, taskClassIds, className]
  );
  const taskTargets = useMemo(() => taskStudentIds.filter((id) => taskStudentOptions.some((o) => o.id === id)), [taskStudentIds, taskStudentOptions]);
  const taskBooks = useMemo(() => {
    const ids = new Set(taskTargets);
    const seen = new Set<string>();
    const out: StudentBook[] = [];
    for (const b of books) {
      if (!ids.has(b.studentId)) continue;
      const k = `${b.title.toLocaleLowerCase('tr-TR')}|${b.subject}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  }, [books, taskTargets, taskModal]);

  const taskInitial: PlanItemDraft = taskModal?.group
    ? { day: taskModal.group.day, subject: taskModal.group.subject, book: taskModal.group.book, note: taskModal.group.note, questionCount: taskModal.group.questionCount }
    : { day: taskModal?.day ?? 0, subject: subjectOptions[0] || '', book: '', note: '' };
  const subjectOptionsForModal = useMemo(
    () => (taskModal?.group && !subjectOptions.includes(taskModal.group.subject) ? [taskModal.group.subject, ...subjectOptions] : subjectOptions),
    [taskModal, subjectOptions]
  );

  const saveTask = async (draft: PlanItemDraft, keepOpen: boolean) => {
    if (taskModal?.mode === 'edit' && taskModal.group) {
      const g = taskModal.group;
      const after = new Set(taskTargets);
      if (!after.size) throw new Error('En az bir öğrenci seçin.');
      const before = new Set(g.items.map((i) => i.studentId));
      const keep = g.items.filter((i) => after.has(i.studentId));
      const remove = g.items.filter((i) => !after.has(i.studentId));
      const addIds = taskTargets.filter((id) => !before.has(id));
      if (draft.book) {
        const nb = await addBookForStudents(taskTargets, draft.book, draft.subject, books).catch(() => []);
        if (nb.length) setBooks((b) => [...b, ...nb]);
      }
      // Sıra önemli: önce yeni öğrencilere eklenir, sonra kalanlar güncellenir, en son çıkarılanlardan silinir.
      // Böylece yarıda bir hata olursa görev hiçbir öğrenciden kaybolmaz.
      let added = 0;
      if (addIds.length) {
        const positions: Record<string, number> = {};
        for (const sid of addIds) positions[sid] = items.filter((i) => i.studentId === sid && i.day === draft.day).reduce((m, i) => Math.max(m, i.position + 1), 0);
        added = (await addPlanItemsBulk(addIds, weekStart, draft, positions, teacherName, nameOfStudent)).length;
      }
      const n = keep.length ? await updatePlanItems(keep.map((i) => i.id), draft) : 0;
      const removed = remove.length ? await deletePlanItems(remove.map((i) => i.id)) : 0;
      setTaskModal(null);
      await reload(true);
      const parts: string[] = [];
      if (n) parts.push(`${n} öğrencide güncellendi`);
      if (added) parts.push(`${added} öğrenciye eklendi`);
      if (removed) parts.push(`${removed} öğrenciden çıkarıldı`);
      const sentNote = anySent && (added || removed || n) ? ' Öğrencilere ve Soru Kaydet bölümüne ulaşması için "Planı yenile"ye basın.' : '';
      say({ tone: 'success', text: `Görev ${parts.join(', ')}.${sentNote}` }, 8000);
      return;
    }
    const targets = taskTargets;
    if (!targets.length) throw new Error('En az bir öğrenci seçin.');
    if (draft.book) {
      const nb = await addBookForStudents(targets, draft.book, draft.subject, books).catch(() => []);
      if (nb.length) setBooks((b) => [...b, ...nb]);
    }
    const positions: Record<string, number> = {};
    for (const sid of targets) positions[sid] = items.filter((i) => i.studentId === sid && i.day === draft.day).reduce((m, i) => Math.max(m, i.position + 1), 0);
    const created = await addPlanItemsBulk(targets, weekStart, draft, positions, teacherName, nameOfStudent);
    setItems((cur) => [...cur, ...created]);
    void reload(true);
    if (keepOpen) setTaskModal((m) => (m ? { ...m, day: draft.day } : m));
    else {
      setTaskModal(null);
      say({ tone: 'success', text: `Görev ${created.length} öğrenciye eklendi.` }, 3500);
    }
  };

  // Aşama 37: düzenlemede çıkarılacak / eklenecek öğrenciler (uyarı metni için)
  const editGroup = taskModal?.mode === 'edit' ? taskModal.group : undefined;
  const editRemoved = editGroup ? editGroup.items.filter((i) => !taskTargets.includes(i.studentId)) : [];
  const editRemovedDone = editRemoved.filter((i) => i.doneAt).length;
  const editAdded = editGroup ? taskTargets.filter((id) => !editGroup.items.some((i) => i.studentId === id)).length : 0;
  const targetSlot = (
      <>
        <div>
          <FieldLabel>1. Sınıf</FieldLabel>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Görevin verileceği sınıflar">
            {classIds
              .filter((cid) => viewStudents.some((s) => s.classId === cid))
              .map((cid) => {
                const on = taskClassIds.includes(cid);
                return (
                  <button key={cid} type="button" id={`plan-task-class-${cid}`} aria-pressed={on} className={chipCls(on)} onClick={() => toggleTaskClass(cid)}>
                    {on && <Check className="w-3.5 h-3.5" />}
                    {className(cid)}
                  </button>
                );
              })}
          </div>
        </div>
        <div>
          <FieldLabel>2. Öğrenciler</FieldLabel>
          <MultiCheckSelect
            id="plan-task-students"
            options={taskStudentOptions}
            selected={taskTargets}
            onChange={setTaskStudentIds}
            placeholder="Öğrenci seçin"
            allLabel="Seçili sınıfların tüm öğrencileri"
            unit="öğrenci"
            searchable
            emptyText="Önce sınıf seçin."
          />
          <p className="text-[11px] text-muted mt-1" id="plan-task-target-count">
            {editGroup
              ? taskTargets.length
                ? `Görev ${targetLabel(taskTargets)} için kaydedilecek.`
                : 'Öğrenci seçilmedi.'
              : taskTargets.length
                ? `Görev ${targetLabel(taskTargets)} için eklenecek.`
                : 'Görev eklenecek öğrenci seçilmedi.'}{' '}
            {editGroup ? 'Değişiklik seçili öğrencilerin hepsine uygulanır.' : 'Sonra ders ve o dersin kitabını seçin.'}
          </p>
        </div>
        {editGroup && (editRemoved.length > 0 || editAdded > 0) && (
          <div role="status" id="plan-task-target-change" className={cx('rounded-lg px-3 py-2 text-[11px] font-semibold', editRemoved.length ? 'bg-warning-soft text-warning-fg' : 'bg-info-soft text-info-fg')}>
            {editAdded > 0 && <span className="block">{editAdded} öğrenciye bu görev eklenecek.</span>}
            {editRemoved.length > 0 && (
              <span className="block">
                {editRemoved.length} öğrenciden bu görev silinecek
                {editRemovedDone > 0 ? ` (${editRemovedDone} öğrenci "yaptım" diye işaretlemişti; işaretleri de silinir)` : ''}.
              </span>
            )}
          </div>
        )}
      </>
    );

  const [deleteGroup, setDeleteGroup] = useState<Group | null>(null);
  const confirmDeleteGroup = async () => {
    const g = deleteGroup;
    setDeleteGroup(null);
    if (!g) return;
    try {
      const n = await deletePlanItems(g.items.map((i) => i.id));
      setItems((cur) => cur.filter((i) => !g.items.some((x) => x.id === i.id)));
      say({ tone: 'success', text: `Görev ${n} öğrenciden silindi.` }, 3500);
    } catch (e: any) {
      say({ tone: 'danger', text: e?.message || 'Görev silinemedi.' });
    }
  };
  const [detailGroup, setDetailGroup] = useState<Group | null>(null);

  const [confirmClear, setConfirmClear] = useState(false);
  const clearable = viewItems.filter((i) => canSubject(i.subject));
  const doClear = async () => {
    setConfirmClear(false);
    try {
      const n = await deletePlanItems(clearable.map((i) => i.id));
      await reload(true);
      say({ tone: 'success', text: `${n} görev silindi.` }, 3500);
    } catch (e: any) {
      say({ tone: 'danger', text: e?.message || 'Plan silinemedi.' });
    }
  };

  // ---- dışa aktarma: her sınıf ayrı sayfa
  const exportSections = () =>
    classIds
      .map((cid) => {
        const ids = new Set(viewStudents.filter((s) => s.classId === cid).map((s) => s.id));
        const list: PlanItem[] = [];
        groupsByDay.flat().forEach((g) => {
          const mine = g.items.filter((i) => ids.has(i.studentId));
          if (!mine.length) return;
          const partial = mine.length < ids.size;
          const names = mine.map((i) => studentById.get(i.studentId)?.name || '').filter(Boolean);
          const who = partial ? (names.length <= 4 ? ` (Yalnız: ${names.join(', ')})` : ` (${names.length} öğrenci)`) : '';
          list.push({ ...mine[0], note: `${g.note}${who}`.trim(), doneAt: null });
        });
        return { studentName: `${className(cid)} (${ids.size} öğrenci)`, whoLabel: 'Sınıf', weekStart, items: list };
      })
      .filter((s) => s.items.length);
  const doExport = async (kind: 'pdf' | 'excel') => {
    const sections = exportSections();
    if (!sections.length || busy) return;
    setBusy(true);
    try {
      const mod = await import('../../lib/studyPlanExport');
      const label = classIds.length === 1 ? className(classIds[0]) : 'Siniflar';
      if (kind === 'pdf') await mod.downloadPlanSectionsPdf(sections, label);
      else await mod.downloadPlanSectionsExcel(sections, label);
    } catch (e: any) {
      say({ tone: 'danger', text: `Dosya hazırlanamadı. ${e?.message || ''}`.trim() });
    } finally {
      setBusy(false);
    }
  };

  const [copyOpen, setCopyOpen] = useState(false);
  const todayStr = ymd(new Date());

  // ---- kitaplar (görünen öğrencilerin ortak kitap listesi)
  const [booksOpen, setBooksOpen] = useState(false);
  const bookCount = useMemo(() => {
    const ids = new Set(viewIds);
    return new Set(books.filter((b) => ids.has(b.studentId) && ownBook(b)).map((b) => `${b.title.toLocaleLowerCase('tr-TR')}|${b.subject}`)).size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, viewIds, restricted]);
  const booksDescription = useMemo(() => {
    const names = classIds.map((cid) => className(cid)).filter(Boolean);
    const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
    return `${shown ? `${shown} · ` : ''}${viewStudents.length} öğrenci`;
  }, [classIds, className, viewStudents.length]);

  // ---------------------------------------------------------------- çizim
  return (
    <div id="study-plan" data-mode="class" className="space-y-4">
      <div className="ui-card ui-card-pad space-y-4">
        {modeSwitch}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="plan-classes">Sınıf</FieldLabel>
            <MultiCheckSelect
              id="plan-classes"
              options={classOptions}
              selected={classIds}
              onChange={onClassesChange}
              placeholder="Sınıf seçin"
              allLabel="Tüm sınıflar"
              unit="sınıf"
              emptyText="Size tanımlı sınıf yok."
            />
          </div>
          <div>
            <FieldLabel htmlFor="plan-students">Öğrenci</FieldLabel>
            <MultiCheckSelect
              id="plan-students"
              options={studentOptions}
              selected={viewIds}
              onChange={onStudentsChange}
              placeholder={classIds.length ? 'Öğrenci seçin' : 'Önce sınıf seçin'}
              allLabel="Tüm öğrenciler"
              unit="öğrenci"
              searchable
              disabled={!classIds.length}
              emptyText="Önce sınıf seçin."
            />
          </div>
        </div>
        {weekNav({
          status: (
            <div className="flex flex-wrap items-center gap-2" id="plan-status">
              {viewStudents.length === 0 ? (
                <span className="ui-chip ui-chip-neutral" id="plan-status-empty">
                  Önce sınıf ve öğrenci seçin
                </span>
              ) : withItems.length === 0 ? (
                <span className="ui-chip ui-chip-neutral">Bu hafta görev yok</span>
              ) : allSent ? (
                <span className="ui-chip ui-chip-success" id="plan-status-sent">
                  <Check className="w-3.5 h-3.5" /> {withItems.length} öğrenciye gönderildi
                </span>
              ) : (
                <span className="ui-chip ui-chip-neutral" id="plan-status-draft">
                  {sentCount > 0 ? `${sentCount} / ${withItems.length} öğrenciye gönderildi` : 'Taslak · öğrenciler henüz görmüyor'}
                </span>
              )}
              {mailedCount > 0 && <span className="ui-chip ui-chip-info">{mailedCount} öğrenciye e-postayla gitti</span>}
              {viewStudents.length > 0 && (
                <span className="text-xs text-muted" id="plan-class-count">
                  {viewStudents.length} öğrenci seçili · {groupsByDay.flat().length} görev
                </span>
              )}
            </div>
          ),
          statusEnd:
            clearable.length > 0 ? (
              <button type="button" id="plan-clear" className="ui-btn ui-btn-ghost ui-btn-sm text-danger-fg" onClick={() => setConfirmClear(true)}>
                <Trash2 className="w-4 h-4" /> Planı temizle
              </button>
            ) : null,
          primary: (
            <>
              {!allSent && (
                <button type="button" id="plan-send" className={cx(planMainBtnCls, 'ui-btn-primary')} disabled={busy || withItems.length === 0} onClick={() => openSend()}>
                  <Send className="w-4 h-4 shrink-0" /> Ödev olarak gönder{withItems.length ? ` (${withItems.length})` : ''}
                </button>
              )}
              {anySent && (
                <>
                  <button
                    type="button"
                    id="plan-refresh"
                    className={cx(planMainBtnCls, 'ui-btn-secondary')}
                    disabled={busy || withItems.length === 0}
                    onClick={doRefresh}
                    title="Gönderdikten sonra yaptığınız değişiklikleri öğrencilere ve Soru Kaydet bölümüne yeniden gönderir"
                  >
                    <RefreshCw className={cx('w-4 h-4 shrink-0', busy && 'animate-spin')} /> Planı yenile
                  </button>
                  <button type="button" id="plan-resend" className={cx(planMainBtnCls, 'ui-btn-secondary')} disabled={busy || withItems.length === 0} onClick={() => openSend('E-posta / WhatsApp ile gönder')}>
                    <Send className="w-4 h-4 shrink-0" /> E-posta / WhatsApp
                  </button>
                  <button type="button" id="plan-unsend" className={cx(planMainBtnCls, 'ui-btn-secondary')} disabled={busy} onClick={doUnsend}>
                    <Undo2 className="w-4 h-4 shrink-0" /> Geri çek
                  </button>
                </>
              )}
            </>
          ),
          actions: (
            <>
              <button type="button" id="plan-pdf" className={planTileCls} disabled={busy || withItems.length === 0} onClick={() => doExport('pdf')}>
                <FileText className="w-5 h-5 text-danger-fg" /> PDF
              </button>
              <button type="button" id="plan-excel" className={planTileCls} disabled={busy || withItems.length === 0} onClick={() => doExport('excel')}>
                <FileSpreadsheet className="w-5 h-5 text-success-fg" /> Excel
              </button>
              <button
                type="button"
                id="plan-to-questions"
                className={planTileCls}
                disabled={busy || transferable.length === 0}
                onClick={doTransferToQuestions}
                title="Seçili öğrencilerin görevlerini Soru Kaydet formundaki “Çalışılan Konu / Test” kutusuna aktarır"
              >
                <Target className="w-5 h-5 text-warning-fg" /> Soru Kaydet'e aktar
              </button>
              <button type="button" id="plan-copy-week" className={planTileCls} disabled={withItems.length === 0} onClick={() => setCopyOpen(true)}>
                <Copy className="w-5 h-5 text-info-fg" /> Başka haftaya kopyala
              </button>
              <button
                type="button"
                id="plan-books"
                className={planTileCls}
                disabled={viewStudents.length === 0}
                title={viewStudents.length === 0 ? 'Önce sınıf ve öğrenci seçin' : 'Seçili öğrencilerin kitaplarını tanımla ve düzenle'}
                aria-label={`Kitaplar (${bookCount})`}
                onClick={() => setBooksOpen(true)}
              >
                <Library className="w-5 h-5 text-brand-fg" /> Kitaplar
                <span className="ui-chip ui-chip-brand absolute right-1.5 top-1.5 px-1.5 py-0 text-[10px] leading-4">{bookCount}</span>
              </button>
            </>
          ),
        })}
      </div>

      {conflictIds.length > 0 && (
        <div role="alert" id="plan-conflicts" className="rounded-xl border border-danger/40 bg-danger-soft text-danger-fg px-4 py-3 text-sm space-y-2">
          <p className="font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Çakışma var: {conflictIds.length} öğrencinin bu tarihlerde başka bir haftalık planı mevcut.
          </p>
          <p className="text-xs">
            {conflictIds
              .slice(0, 6)
              .map((id) => nameOfStudent(id))
              .join(', ')}
            {conflictIds.length > 6 ? ` +${conflictIds.length - 6}` : ''} — bu öğrencilere bu haftada görev eklenemez. Görevlerin mevcut plana eklenmesi
            için o haftayı açın:
          </p>
          <div className="flex flex-wrap gap-2">
            {conflictWeeks.map((ws) => (
              <button key={ws} type="button" data-conflict-week={ws} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onWeekChange(ws)}>
                {planWeekText(ws)}
              </button>
            ))}
          </div>
        </div>
      )}

      {withItems.length > 0 && !allSent && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-xl border border-warning/40 bg-warning-soft px-4 py-3" id="plan-draft-callout">
          <p className="text-sm text-warning-fg font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {sentCount > 0
              ? `Planı ${withItems.length - sentCount} öğrenci henüz görmüyor. Görmeleri için "Ödev olarak gönder"e basın.`
              : 'Plan taslak: öğrenciler henüz görmüyor. Görmeleri için "Ödev olarak gönder"e basın.'}
          </p>
          <button type="button" id="plan-send-callout" className="ui-btn ui-btn-primary ui-btn-sm shrink-0" disabled={busy} onClick={() => openSend()}>
            <Send className="w-4 h-4" /> Ödev olarak gönder
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

      {classIds.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Users} title="Sınıf seçin" description="Yukarıdaki Sınıf listesinden bir ya da birden fazla sınıfı işaretleyin; öğrenciler otomatik seçilir." />
        </div>
      ) : viewStudents.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Users} title="Öğrenci seçilmedi" description="Öğrenci listesinden en az bir öğrenciyi işaretleyin." />
        </div>
      ) : (
        <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', loading && 'opacity-60 transition-opacity')} id="plan-days" aria-busy={loading}>
          {groupsByDay.map((list, d) => {
            const date = dateOfDay(weekStart, d);
            const isToday = date === todayStr;
            return (
              <section key={d} data-day={d} className={cx('ui-card flex flex-col min-h-[9rem]', isToday && 'ring-2 ring-brand/50 border-brand/50')} aria-label={`${planDayName(weekStart, d)} görevleri`}>
                <header className={cx('flex items-center justify-between gap-2 px-3 py-2 border-b border-line rounded-t-2xl', isToday ? 'bg-brand-soft' : 'bg-surface-2/60')}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-fg leading-tight">
                      {planDayName(weekStart, d)}
                      {isToday && <span className="ml-1.5 text-[10px] font-bold text-brand-fg uppercase">bugün</span>}
                    </p>
                    <p className="text-[11px] text-muted">{shortDayLabel(date)}</p>
                  </div>
                  <button
                    type="button"
                    id={`plan-add-${d}`}
                    aria-label={`${planDayName(weekStart, d)} gününe görev ekle`}
                    title="Görev ekle"
                    className="ui-btn ui-btn-primary ui-btn-icon ui-btn-sm"
                    onClick={() => openAdd(d)}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </header>
                <div className="flex-1 p-2 space-y-2">
                  {list.length === 0 && <p className="text-xs text-subtle px-1 py-2">Görev yok</p>}
                  {list.map((g) => {
                    const editable = canSubject(g.subject);
                    const sentItems = g.items.filter((i) => headers[i.studentId]?.sentAt);
                    const done = g.items.filter((i) => i.doneAt).length;
                    return (
                      <article key={g.key} data-plan-group={g.key} data-subject={g.subject} data-count={g.items.length} className="rounded-xl border border-line bg-surface p-2.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className={cx('inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold', subjectTone(g.subject))}>{g.subject}</span>
                          {editable && (
                            <span className="flex items-center gap-0.5 shrink-0">
                              <button type="button" aria-label="Görevi düzenle" title="Düzenle" data-edit className="p-1 rounded-md text-muted hover:text-fg hover:bg-surface-2 cursor-pointer" onClick={() => openEdit(g)}>
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" aria-label="Görevi sil" title="Sil" data-delete className="p-1 rounded-md text-muted hover:text-danger-fg hover:bg-danger-soft cursor-pointer" onClick={() => setDeleteGroup(g)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          )}
                        </div>
                        {g.book && (
                          <p className="flex items-start gap-1.5 text-xs font-semibold text-fg">
                            <BookOpen className="w-3.5 h-3.5 shrink-0 mt-px text-muted" />
                            <span className="min-w-0 break-words">{g.book}</span>
                          </p>
                        )}
                        {g.note && <p className="text-xs text-fg-2 whitespace-pre-wrap break-words">{g.note}</p>}
                        {g.questionCount > 0 && (
                          <p className="inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand-fg px-2 py-0.5 text-[11px] font-bold" data-plan-qcount>
                            {g.questionCount} soru
                          </p>
                        )}
                        <button
                          type="button"
                          data-target-label
                          onClick={() => setDetailGroup(g)}
                          className="w-full flex items-center justify-between gap-2 text-left rounded-lg bg-surface-2/70 hover:bg-surface-2 px-2 py-1 cursor-pointer"
                          title="Öğrencileri gör"
                        >
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-2 min-w-0">
                            <Users className="w-3 h-3 shrink-0" />
                            <span className="truncate">{targetLabel(g.items.map((i) => i.studentId))}</span>
                          </span>
                          {sentItems.length > 0 && (
                            <span className={cx('shrink-0 text-[10px] font-bold', done === g.items.length ? 'text-success-fg' : 'text-muted')} data-done-count>
                              Yaptı {done}/{g.items.length}
                            </span>
                          )}
                        </button>
                        {g.createdByName && <p className="text-[10px] text-subtle">{g.createdByName}</p>}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <StudyPlanTaskModal
        showAllBooks={isAdmin}
        open={!!taskModal}
        mode={taskModal?.mode || 'add'}
        weekStart={weekStart}
        initial={taskInitial}
        subjectOptions={subjectOptionsForModal}
        books={taskBooks}
        studentName={`Sınıf planı — ${weekRangeLabel(weekStart)}`}
        onClose={() => setTaskModal(null)}
        onSave={saveTask}
        targetSlot={targetSlot}
        validateTarget={() => (taskTargets.length === 0 ? 'Görevin verileceği en az bir öğrenci seçin.' : null)}
        bookOwnerLabel="Seçilen öğrenciler"
      />
      <ConfirmDeleteModal
        isOpen={!!deleteGroup}
        onClose={() => setDeleteGroup(null)}
        onConfirm={confirmDeleteGroup}
        title="Görev silinsin mi?"
        description={deleteGroup ? `Bu görev ${targetLabel(deleteGroup.items.map((i) => i.studentId))} için plandan kaldırılır.` : ''}
        itemBadge={deleteGroup ? `${deleteGroup.subject}${deleteGroup.book ? ` · ${deleteGroup.book}` : ''}` : undefined}
      />
      <ConfirmDeleteModal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={doClear}
        title="Seçili öğrencilerin bu haftaki planı temizlensin mi?"
        description={
          clearable.length < viewItems.length
            ? `Yalnızca sizin branşınızdaki ${clearable.length} görev silinir; diğer öğretmenlerin görevlerine dokunulmaz.`
            : `${viewStudents.length} öğrencinin bu haftaki ${clearable.length} görevi silinir. Bu işlem geri alınamaz.`
        }
        confirmButtonText="Evet, temizle"
      />
      {detailGroup && (
        <Modal
          open
          onClose={() => setDetailGroup(null)}
          id="plan-group-detail"
          icon={Users}
          tone="info"
          title={`${detailGroup.subject}${detailGroup.book ? ` · ${detailGroup.book}` : ''}`}
          description={`${planDayName(weekStart, detailGroup.day)} · ${detailGroup.items.length} öğrenci`}
          footer={
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => setDetailGroup(null)}>
              Kapat
            </button>
          }
        >
          <ul className="divide-y divide-line rounded-xl border border-line">
            {[...detailGroup.items]
              .sort((a, b) => (studentById.get(a.studentId)?.name || '').localeCompare(studentById.get(b.studentId)?.name || '', 'tr'))
              .map((i) => {
                const s = studentById.get(i.studentId);
                const sent = !!headers[i.studentId]?.sentAt;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm" data-detail-student={i.studentId}>
                    <span className="min-w-0 truncate">
                      {s?.name || 'Öğrenci'}
                      {s?.classId && <span className="text-xs text-muted"> · {className(s.classId)}</span>}
                    </span>
                    {!sent ? (
                      <span className="text-[11px] text-muted">Gönderilmedi</span>
                    ) : i.doneAt ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success-fg">
                        <Check className="w-3.5 h-3.5" /> Yaptı
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted">Bekliyor</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </Modal>
      )}
      {sendModal && (
        <StudyPlanSendModal
          weekStart={weekStart}
          students={sendModal.students}
          classes={classes}
          kind={sendModal.kind}
          classId={sendModal.classId}
          teacherName={teacherName}
          title={sendModal.title || 'Planı öğrencilere gönder'}
          canSubject={canSubject}
          onClose={(changed) => {
            setSendModal(null);
            if (changed) void reload(true);
          }}
        />
      )}
      {copyOpen && (
        <CopyWeekModal
          weekStart={weekStart}
          students={withItems}
          items={shownItems}
          canSubject={canSubject}
          senderName={teacherName}
          onClose={() => setCopyOpen(false)}
        />
      )}
      {booksOpen && viewStudents.length > 0 && (
        <StudyPlanBooksModal
          title="Sınıfın kitapları"
          description={booksDescription}
          studentIds={viewIds}
          books={books}
          subjectOptions={subjectOptions}
          restrictToSubjects={restricted}
          onChange={setBooks}
          onClose={() => setBooksOpen(false)}
        />
      )}
    </div>
  );
};

// ============================================================================ Başka haftaya kopyala
const CopyWeekModal: React.FC<{
  weekStart: string;
  students: Student[];
  items: PlanItem[];
  canSubject: (s: string) => boolean;
  senderName: string;
  onClose: () => void;
}> = ({ weekStart, students, items, canSubject, senderName, onClose }) => {
  const [mode, setMode] = useState<'next' | 'custom'>('next');
  const [date, setDate] = useState(addDaysYmd(weekStart, 7));
  const [send, setSend] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ students: number; added: number; skipped: number; failed: number; messages: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = mode === 'next' ? addDaysYmd(weekStart, 7) : weekStartOf(date || weekStart, weekStartDayOf(weekStart));
  const run = async () => {
    if (running) return;
    if (target === weekStart) return setError('Hedef hafta bu haftadan farklı olmalı.');
    setRunning(true);
    setError(null);
    const out = { students: 0, added: 0, skipped: 0, failed: 0, messages: [] as string[] };
    try {
      for (const s of students) {
        const r = await applyPlan({ items: items.filter((i) => i.studentId === s.id), targetStudentIds: [s.id], targetWeek: target, send, senderName, canUseSubject: canSubject });
        out.students += r.students;
        out.added += r.added;
        out.skipped += r.skipped;
        out.failed += r.failed.length;
        r.failed.forEach((f) => out.messages.push(`${s.name}: ${f.message}`));
      }
      setResult(out);
    } catch (e: any) {
      setError(e?.message || 'Kopyalanamadı.');
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      id="plan-copy-modal"
      icon={Copy}
      tone="brand"
      title="Planı başka haftaya kopyala"
      description={`${students.length} öğrencinin ${weekRangeLabel(weekStart)} planı`}
      footer={
        result ? (
          <button type="button" id="plan-copy-close" className="ui-btn ui-btn-primary" onClick={onClose}>
            Tamam
          </button>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
              Vazgeç
            </button>
            <button type="button" id="plan-copy-run" className="ui-btn ui-btn-primary" disabled={running} onClick={run}>
              {running ? 'Kopyalanıyor…' : 'Kopyala'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="rounded-xl bg-success-soft text-success-fg px-4 py-3 text-sm font-semibold" id="plan-copy-result">
          {result.students} öğrenciye {weekRangeLabel(target)} haftası için {result.added} görev eklendi
          {result.skipped ? `, ${result.skipped} görev zaten vardı` : ''}.{send ? ' Planlar öğrencilere gönderildi.' : ''}
          {result.failed ? ` ${result.failed} öğrenciye eklenemedi.` : ''}
          {result.messages.slice(0, 4).map((m) => (
            <p key={m} className="mt-1 text-xs font-medium text-warning-fg" data-copy-fail>
              {m}
            </p>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" id="plan-copy-next" className={chipCls(mode === 'next')} onClick={() => setMode('next')}>
              Gelecek hafta
            </button>
            <button type="button" id="plan-copy-custom" className={chipCls(mode === 'custom')} onClick={() => setMode('custom')}>
              Başka hafta
            </button>
            {mode === 'custom' && <input type="date" id="plan-copy-date" value={date} onChange={(e) => setDate(e.target.value)} className={cx(inputCls, 'w-44')} />}
          </div>
          <p className="text-xs text-muted">
            Hedef hafta: <strong>{weekRangeLabel(target)}</strong>. Aynı görev hedefte zaten varsa tekrar eklenmez; yalnızca sizin branşınızdaki görevler kopyalanır.
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-line px-3 py-2.5">
            <input type="checkbox" id="plan-copy-send" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]" />
            <span className="text-sm">
              <span className="font-semibold text-fg">Kopyalanan planlar hemen öğrencilere ödev olarak gönderilsin</span>
            </span>
          </label>
          {error && (
            <div role="alert" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
