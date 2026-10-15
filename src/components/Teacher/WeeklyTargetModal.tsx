import React, { useEffect, useMemo, useState } from 'react';
import { Target, Save, Trash2, User, Users, Info, AlertCircle, X, Plus, Divide, ClipboardList } from 'lucide-react';
import type { Student, ClassGroup, WeeklyQuestionTarget } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, Segmented } from '../ui/kit';
import { normalizeSubject, shortSubjectName, subjectsForLevel, targetSubjectList } from '../../lib/subjects';
import { loadPlanQuestionCountsMany, type PlanQuestionCounts } from '../../services/studyPlanService';
import { SubjectMultiSelect } from './SubjectMultiSelect';
import { FormSection, FieldLabel, inputCls, chipCls, classLevel, localDateStr, addDays, shortTrDate, DiscardBar, MailOptIn } from './FormParts';

// ============================================================================
// Soru hedefi ver / düzenle penceresi (Aşama 10)
// Her öğretmen kendi hedefini verir; hedef yalnızca kendi tarihleri (ve seçildiyse kendi dersi) içinde sayılır.
// ============================================================================

export interface TargetFormSaved {
  target: WeeklyQuestionTarget;
  isNew: boolean;
  changed: boolean;
  sendMail: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  students: Student[];
  classes: ClassGroup[];
  editTarget?: WeeklyQuestionTarget | null;
  presetKind?: 'student' | 'class';
  presetStudentId?: string;
  presetClassId?: string;
  defaultStart: string;
  defaultEnd: string;
  onSaved: (r: TargetFormSaved) => void;
}

// Soru çözülmeyen dersler hedef listesinde gösterilmez
const NON_QUESTION_SUBJECTS = new Set(['Görsel Sanatlar', 'Müzik', 'Beden Eğitimi', 'Rehberlik', 'Teknoloji ve Tasarım', 'Bilişim Teknolojileri', 'Genel']);
const MAX_DAILY = 2000;
const MAX_TOTAL = 100000;
const MAX_CUSTOM_DAYS = 62; // gün gün dağıtım en fazla 62 günlük hedeflerde
const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const parseYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const daysBetween = (a: string, b: string) => {
  const da = parseYmd(a);
  const db = parseYmd(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000) + 1;
};
// Aşama 43: haftanın verilen günden (0 = Pazar … 1 = Pazartesi) başladığı hafta başlangıcı
const weekStartFrom = (d: Date, startDay = 1) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() - startDay + 7) % 7));
  return x;
};
const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : NaN);
const subjectTargetsOf = (t?: WeeklyQuestionTarget | null): Record<string, string> => {
  const out: Record<string, string> = {};
  const st = t?.subjectTargets;
  if (Array.isArray(st)) st.forEach((x) => x && x.subject && (out[normalizeSubject(x.subject)] = String(Number(x.target) || 0)));
  else if (st && typeof st === 'object') Object.entries(st).forEach(([k, v]) => (out[normalizeSubject(k)] = String(Number(v) || 0)));
  return out;
};

export const WeeklyTargetModal: React.FC<Props> = (props) =>
  props.open ? <TargetFormContent key={props.editTarget?.id || `new-${props.presetKind}-${props.presetStudentId}-${props.presetClassId}`} {...props} /> : null;

const TargetFormContent: React.FC<Props> = ({
  onClose,
  students,
  classes,
  editTarget,
  presetKind,
  presetStudentId,
  presetClassId,
  defaultStart,
  defaultEnd,
  onSaved,
}) => {
  const isEdit = !!editTarget;
  // Günlük plandan bu hedefe aktarılmış konular varsa gün kutularının altında gösterilir
  const planTopics = editTarget?.dailyTopics || {};
  const canEdit = !editTarget || dataService.canEditQuestionTarget(editTarget);
  const mySubjects = dataService.getMySubjects(); // null = yönetici

  const initial = useMemo(() => {
    const t = editTarget;
    const kind: 'student' | 'class' = t ? (t.targetType === 'class' || (!t.studentId && t.classId) ? 'class' : 'student') : presetKind || 'student';
    const studentId = t?.studentId || presetStudentId || '';
    const st = students.find((s) => s.id === studentId);
    const classId = t?.classId || presetClassId || st?.classId || (classes.length === 1 ? classes[0].id : '');
    const start = t?.weekStartDate || defaultStart || localDateStr(new Date());
    const end = t ? dataService.questionTargetEnd(t) : defaultEnd || localDateStr(addDays(parseYmd(start) || new Date(), 6));
    const days = Math.max(1, daysBetween(start, end));
    const total = t ? Number(t.targetQuestions || t.weeklyTarget) || 350 : 350;
    const daily = t ? Number(t.dailyTarget) || Math.max(1, Math.round(total / days)) : Math.max(1, Math.round(total / days));
    return {
      kind,
      studentId: st ? studentId : '',
      classId,
      subjects: targetSubjectList(t?.subject),
      start,
      end,
      daily: String(daily),
      total: String(total),
      subjectRows: subjectTargetsOf(t),
      notes: t?.notes || '',
      // Gün gün dağıtım (eski kayıtlarda yok → eşit dağıtım)
      distMode: (t?.dailyTargets && Object.keys(t.dailyTargets).length ? 'custom' : 'even') as 'even' | 'custom',
      dayRows: Object.fromEntries(Object.entries(t?.dailyTargets || {}).map(([k, v]) => [k, String(Number(v) || 0)])) as Record<string, string>,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [kind, setKind] = useState<'student' | 'class'>(initial.kind);
  const [classId, setClassId] = useState(initial.classId);
  const [studentId, setStudentId] = useState(initial.studentId);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [daily, setDaily] = useState(initial.daily);
  const [total, setTotal] = useState(initial.total);
  // Tüm dersler hedefinde eklenen ders satırları / birden çok ders seçildiğinde her dersin kutusu
  const [subjectRows, setSubjectRows] = useState<Record<string, string>>(initial.subjects.length > 1 ? {} : initial.subjectRows);
  const [multiRows, setMultiRows] = useState<Record<string, string>>(initial.subjects.length > 1 ? initial.subjectRows : {});
  const [subjectToAdd, setSubjectToAdd] = useState('');
  const [notes, setNotes] = useState(initial.notes);
  const [sendMail, setSendMail] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [daysDraft, setDaysDraft] = useState<string | null>(null); // gün sayısı kutusuna yazılırken
  // Soruların günlere dağılımı: 'even' = her gün eşit, 'custom' = her güne ayrı sayı
  const [distMode, setDistMode] = useState<'even' | 'custom'>(initial.distMode);
  const [dayRows, setDayRows] = useState<Record<string, string>>(initial.dayRows);

  useEffect(() => {
    if (errorText) document.getElementById('qt-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errorText]);

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === classId).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [students, classId]
  );
  const selectedStudent = students.find((s) => s.id === studentId) || null;
  const level = classLevel(kind === 'student' ? classes.find((c) => c.id === selectedStudent?.classId) || selectedClass : selectedClass);

  // ---- ders seçenekleri (birden çok ders seçilebilir; hiç seçilmezse tüm dersler)
  const { subjectOptions, allowGeneral } = useMemo(() => {
    let list: string[];
    let allowAll: boolean;
    if (mySubjects) {
      list = mySubjects.filter((s) => !NON_QUESTION_SUBJECTS.has(s));
      allowAll = list.length === 0; // rehberlik vb. branşlar genel hedef verir
    } else {
      list = subjectsForLevel(level).filter((s) => !NON_QUESTION_SUBJECTS.has(s));
      allowAll = true;
    }
    if (isEdit) for (const s of initial.subjects) if (!list.includes(s)) list = [...list, s]; // eski kayıt kaybolmasın
    return { subjectOptions: list, allowGeneral: allowAll };
  }, [mySubjects, level, isEdit, initial.subjects]);
  const [subjectsSel, setSubjectsSel] = useState<string[]>(() => initial.subjects);
  const selectedSubjects = useMemo(() => {
    const valid = subjectsSel.filter((s) => subjectOptions.includes(s));
    if (valid.length === 0 && !allowGeneral) return subjectOptions.slice(0, 1);
    return valid;
  }, [subjectsSel, subjectOptions, allowGeneral]);
  const effectiveSubject = selectedSubjects.join(', ');
  const fixedSubject = !allowGeneral && subjectOptions.length <= 1;
  // Ders dağılımı: birden çok ders seçildiyse o dersler, hiç seçilmediyse (tüm dersler) eklenen dersler
  const multi = selectedSubjects.length > 1;
  const showBreakdown = selectedSubjects.length !== 1;
  const breakdownRows: Array<[string, string]> = multi
    ? selectedSubjects.map((s) => [s, multiRows[s] ?? ''])
    : Object.entries(subjectRows);
  const breakdownSubjects = useMemo(
    () => subjectsForLevel(level).filter((s) => !NON_QUESTION_SUBJECTS.has(s) && !(s in subjectRows)),
    [level, subjectRows]
  );
  const breakdownTargets = Object.fromEntries(
    breakdownRows.filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, toInt(v) || 0])
  );
  const distributeEvenly = () => {
    const tn = toInt(shownTotal);
    const names = breakdownRows.map(([k]) => k);
    if (!(tn >= 1) || names.length === 0) return;
    const base = Math.floor(tn / names.length);
    let rest = tn - base * names.length;
    const next: Record<string, string> = { ...(multi ? multiRows : subjectRows) };
    for (const k of names) {
      next[k] = String(base + (rest > 0 ? 1 : 0));
      if (rest > 0) rest--;
    }
    (multi ? setMultiRows : setSubjectRows)(next);
  };
  const setRow = (k: string, v: string) => (multi ? setMultiRows : setSubjectRows)((r) => ({ ...r, [k]: v }));

  // ---- gün / günlük / toplam bağlantısı
  const days = Math.max(0, daysBetween(start, end));
  const applyDates = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
    const d = daysBetween(s, e);
    const dn = toInt(daily);
    if (d >= 1 && dn >= 1) setTotal(String(dn * d));
  };
  // Gün sayısı elle girilince bitiş tarihi = başlangıç + gün − 1; toplam hedef günlüğe göre yeniden hesaplanır
  const onDaysChange = (v: string) => {
    const clean = v.replace(/[^\d]/g, '').slice(0, 3);
    setDaysDraft(clean);
    const n = toInt(clean);
    const s0 = parseYmd(start);
    if (!s0 || !(n >= 1 && n <= 366)) return;
    const e = localDateStr(addDays(s0, n - 1));
    setEnd(e);
    const dn = toInt(daily);
    if (dn >= 1) setTotal(String(dn * n));
  };
  const onDailyChange = (v: string) => {
    const clean = v.replace(/[^\d]/g, '').slice(0, 5);
    setDaily(clean);
    const n = toInt(clean);
    if (n >= 1 && days >= 1) setTotal(String(n * days));
  };
  const onTotalChange = (v: string) => {
    const clean = v.replace(/[^\d]/g, '').slice(0, 6);
    setTotal(clean);
    const n = toInt(clean);
    if (n >= 1 && days >= 1) setDaily(String(Math.max(1, Math.round(n / days))));
  };
  // ---- gün gün dağıtım
  const rangeDates = useMemo(() => {
    const s0 = parseYmd(start);
    if (!s0 || days < 1 || days > MAX_CUSTOM_DAYS) return [] as string[];
    return Array.from({ length: days }, (_, i) => localDateStr(addDays(s0, i)));
  }, [start, days]);
  const customAllowed = rangeDates.length > 0;
  const isCustom = distMode === 'custom' && customAllowed;
  const customTotal = rangeDates.reduce((a, d) => a + (toInt(dayRows[d] ?? '') || 0), 0);
  // Gün gün modunda toplam = günlerin toplamı, günlük = ortalama (kutular kilitli, otomatik)
  const shownTotal = isCustom ? String(customTotal) : total;
  const shownDaily = isCustom ? String(days >= 1 ? Math.max(1, Math.round(customTotal / days)) : 0) : daily;
  // Toplamı günlere eşit böler (artan sorular ilk günlere birer birer eklenir)
  const spreadEvenly = (sum: number): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!rangeDates.length) return out;
    const base = Math.floor(sum / rangeDates.length);
    let rest = sum - base * rangeDates.length;
    for (const d of rangeDates) {
      out[d] = String(base + (rest > 0 ? 1 : 0));
      if (rest > 0) rest--;
    }
    return out;
  };
  const switchDistMode = (mode: 'even' | 'custom') => {
    if (mode === distMode) return;
    if (mode === 'custom') {
      // Önceki dağıtımda olmayan günler mevcut toplamdan eşit doldurulur
      const filled = spreadEvenly(toInt(total) || 0);
      setDayRows((cur) => {
        const next: Record<string, string> = {};
        for (const d of rangeDates) next[d] = cur[d] ?? filled[d] ?? '0';
        return next;
      });
    } else {
      // Eşit dağıtıma dönerken gün gün yazılan toplam korunur
      if (customTotal >= 1) {
        setTotal(String(customTotal));
        if (days >= 1) setDaily(String(Math.max(1, Math.round(customTotal / days))));
      }
    }
    setDistMode(mode);
  };
  // Gün gün modunda tarih aralığı değişirse yeni eklenen günler günlük ortalamayla doldurulur
  useEffect(() => {
    if (distMode !== 'custom' || !rangeDates.length) return;
    setDayRows((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const d of rangeDates) {
        if (next[d] === undefined) {
          next[d] = daily || '0';
          changed = true;
        }
      }
      return changed ? next : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDates, distMode]);
  const setDayRow = (d: string, v: string) => setDayRows((r) => ({ ...r, [d]: v.replace(/[^\d]/g, '').slice(0, 4) }));

  const today = new Date();
  // Aşama 43: tek öğrenciye hedef verilirken "Bu hafta / Gelecek hafta" öğrencinin haftalık planının
  // başladığı günden başlar (plan yoksa Pazartesi).
  // Aşama 45: sınıfa hedef verilirken sınıftaki öğrencilerin planlarında EN ÇOK kullanılan başlangıç günü alınır.
  const presetWeekDay = useMemo(() => {
    if (kind === 'student') return studentId ? dataService.getStudentWeekStartDay(studentId) : 1;
    if (!classStudents.length) return 1;
    const freq = new Map<number, number>();
    for (const st of classStudents) {
      const d = dataService.getStudentWeekStartDay(st.id);
      freq.set(d, (freq.get(d) || 0) + 1);
    }
    let best = 1;
    let bestN = 0;
    for (const [d, n] of freq) {
      if (n > bestN || (n === bestN && d === 1)) {
        best = d;
        bestN = n;
      }
    }
    return best;
  }, [kind, studentId, classStudents]);
  const presets: Array<{ id: string; label: string; s: string; e: string }> = useMemo(() => {
    const mon = weekStartFrom(today, presetWeekDay);
    const nextMon = addDays(mon, 7);
    return [
      { id: 'this-week', label: 'Bu hafta', s: localDateStr(mon), e: localDateStr(addDays(mon, 6)) },
      { id: 'next-week', label: 'Gelecek hafta', s: localDateStr(nextMon), e: localDateStr(addDays(nextMon, 6)) },
      { id: '7-days', label: 'Bugünden 7 gün', s: localDateStr(today), e: localDateStr(addDays(today, 6)) },
      { id: '2-weeks', label: '2 hafta', s: localDateStr(mon), e: localDateStr(addDays(mon, 13)) },
      {
        id: 'month',
        label: 'Bu ay',
        s: localDateStr(new Date(today.getFullYear(), today.getMonth(), 1)),
        e: localDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetWeekDay]);

  // Aşama 43: HAYALET BİLGİ — seçilen tarihlerde öğrencinin haftalık planlarında (bütün öğretmenler)
  // verilmiş soru sayıları. Hedef veren öğretmen bunları dikkate alsın diye gösterilir (kaydedilmez).
  // Aşama 45: sınıfa hedef verilirken sınıftaki öğrencilerin planlarındaki sayılar ÖĞRENCİ BAŞINA ORTALAMA olarak gösterilir
  //            (planı olan öğrenciler üzerinden; sınıf hedefi her öğrenciye ayrı ayrı uygulanır).
  const [planCounts, setPlanCounts] = useState<PlanQuestionCounts | null>(null);
  const [planGhostInfo, setPlanGhostInfo] = useState<{ withPlan: number; total: number } | null>(null);
  const classStudentKey = classStudents.map((s) => s.id).join(',');
  useEffect(() => {
    setPlanCounts(null);
    setPlanGhostInfo(null);
    if (!parseYmd(start) || !parseYmd(end) || end < start) return;
    const ids = kind === 'student' ? (studentId ? [studentId] : []) : classStudents.map((s) => s.id);
    if (!ids.length) return;
    let alive = true;
    loadPlanQuestionCountsMany(ids, start, end).then((all) => {
      if (!alive) return;
      const list = ids.map((id) => all[id]).filter((c): c is PlanQuestionCounts => !!c && c.total > 0);
      if (!list.length) return;
      if (kind === 'student') {
        setPlanCounts(list[0]);
        return;
      }
      const n = list.length;
      const avg = (v: number) => Math.max(1, Math.round(v / n));
      const out: PlanQuestionCounts = { bySubject: {}, byDay: {}, total: 0 };
      for (const c of list) {
        for (const [subj, v] of Object.entries(c.bySubject)) out.bySubject[subj] = (out.bySubject[subj] || 0) + v;
        for (const [date, map] of Object.entries(c.byDay)) {
          const d = (out.byDay[date] = out.byDay[date] || {});
          for (const [subj, v] of Object.entries(map)) d[subj] = (d[subj] || 0) + v;
        }
      }
      for (const k of Object.keys(out.bySubject)) out.bySubject[k] = avg(out.bySubject[k]);
      for (const map of Object.values(out.byDay)) for (const k of Object.keys(map)) map[k] = avg(map[k]);
      out.total = Object.values(out.bySubject).reduce((a, b) => a + b, 0);
      setPlanCounts(out);
      setPlanGhostInfo({ withPlan: n, total: ids.length });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, studentId, classStudentKey, start, end]);
  const ghostText = (bySubject: Record<string, number>) =>
    Object.entries(bySubject)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${shortSubjectName(s)} ${n}`)
      .join(' · ');

  // ---- taslak ve çakışma
  const draft: WeeklyQuestionTarget = {
    id: editTarget?.id,
    targetType: kind,
    studentId: kind === 'student' ? studentId : undefined,
    studentName: kind === 'student' ? selectedStudent?.name : undefined,
    classId: kind === 'student' ? selectedStudent?.classId || classId : classId,
    className: kind === 'student' ? selectedStudent?.className || selectedClass?.name : selectedClass?.name,
    weekStartDate: start,
    weekEndDate: end,
    targetDays: days,
    targetQuestions: toInt(shownTotal),
    dailyTarget: toInt(shownDaily),
    // Eşit dağıtımda açıkça boş gönderilir (önceden gün gün dağıtılmış hedef eşite çevrilebilsin)
    dailyTargets: isCustom ? Object.fromEntries(rangeDates.map((d) => [d, toInt(dayRows[d] ?? '') || 0])) : undefined,
    subject: effectiveSubject || undefined,
    subjectTargets: showBreakdown ? breakdownTargets : undefined,
    notes,
    assignedByTeacherId: editTarget?.assignedByTeacherId,
  };
  const hasTarget = kind === 'student' ? !!studentId : !!classId;
  const conflict = !isEdit && hasTarget && start && end >= start ? dataService.findQuestionTargetConflict(draft) : null;

  const dirty =
    kind !== initial.kind ||
    classId !== initial.classId ||
    studentId !== initial.studentId ||
    start !== initial.start ||
    end !== initial.end ||
    shownTotal !== initial.total ||
    shownDaily !== initial.daily ||
    (isCustom ? 'custom' : 'even') !== initial.distMode ||
    (isCustom && JSON.stringify(draft.dailyTargets) !== JSON.stringify(Object.fromEntries(Object.entries(initial.dayRows).map(([k, v]) => [k, toInt(v) || 0])))) ||
    effectiveSubject !== initial.subjects.join(', ') ||
    notes !== initial.notes ||
    JSON.stringify(showBreakdown ? breakdownTargets : {}) !==
      JSON.stringify(Object.fromEntries(Object.entries(initial.subjectRows).map(([k, v]) => [k, toInt(v) || 0])));

  const requestClose = () => {
    if (isSaving) return;
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const validate = (): string | null => {
    if (!canEdit) return 'Bu hedefi yalnızca hedefi veren öğretmen değiştirebilir.';
    if (kind === 'class' && !classId) return 'Hedef verilecek sınıfı seçin.';
    if (kind === 'student' && !studentId) return 'Hedef verilecek öğrenciyi seçin.';
    if (!parseYmd(start) || !parseYmd(end)) return 'Başlangıç ve bitiş tarihini seçin.';
    if (end < start) return 'Bitiş tarihi başlangıçtan önce olamaz.';
    if (days > 366) return 'Hedef süresi en fazla 1 yıl olabilir.';
    const dn = toInt(shownDaily);
    const tn = toInt(shownTotal);
    if (isCustom) {
      for (const d of rangeDates) {
        const raw = (dayRows[d] ?? '').trim();
        const n = raw === '' ? 0 : toInt(raw);
        if (!(n >= 0 && n <= MAX_DAILY)) return `${shortTrDate(d)} için soru sayısı 0 ile ${MAX_DAILY} arasında olmalı.`;
      }
      if (customTotal < 1) return 'Gün gün dağıtımda en az bir güne soru yazın.';
    }
    if (!(dn >= 1 && dn <= MAX_DAILY)) return `Günlük hedef 1 ile ${MAX_DAILY} arasında tam sayı olmalı.`;
    if (!(tn >= 1 && tn <= MAX_TOTAL)) return `Toplam hedef 1 ile ${MAX_TOTAL.toLocaleString('tr-TR')} arasında tam sayı olmalı.`;
    if (selectedSubjects.length === 0 && !allowGeneral) return 'En az bir ders seçin.';
    if (showBreakdown) {
      let sum = 0;
      for (const [k, v] of breakdownRows) {
        if (v.trim() === '') continue; // boş bırakılan ders için ayrı hedef yok
        const n = toInt(v);
        if (!(n >= 1)) return `${k} için ders hedefi en az 1 olmalı (istemiyorsanız kutuyu boş bırakın).`;
        sum += n;
      }
      if (sum > tn) return `Ders hedeflerinin toplamı (${sum}) genel hedeften (${tn}) büyük olamaz.`;
    }
    if (notes.length > 400) return 'Not en fazla 400 karakter olabilir.';
    return null;
  };

  const handleSave = async () => {
    if (isSaving) return;
    setConfirmDiscard(false);
    const err = validate();
    if (err) return setErrorText(err);
    setErrorText(null);
    setIsSaving(true);
    try {
      const toSave: WeeklyQuestionTarget = { ...draft, id: editTarget?.id || conflict?.id };
      const saved = await dataService.saveQuestionTarget(toSave);
      const base = editTarget || conflict;
      const sig = (t?: WeeklyQuestionTarget | null) =>
        t
          ? JSON.stringify([
              t.targetType === 'class' ? 'c' : 's',
              t.studentId || '',
              t.classId || '',
              t.weekStartDate,
              dataService.questionTargetEnd(t),
              Number(t.targetQuestions || t.weeklyTarget) || 0,
              Number(t.dailyTarget) || 0,
              normalizeSubject(t.subject || ''),
              subjectTargetsOf(t),
              t.dailyTargets || null,
              (t.notes || '').trim(),
            ])
          : '';
      onSaved({ target: saved, isNew: !base, changed: !base || sig(base) !== sig(saved), sendMail });
    } catch (e: any) {
      setErrorText(e?.message || 'Hedef kaydedilemedi. Lütfen tekrar deneyin.');
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editTarget?.id || isSaving) return;
    setIsSaving(true);
    try {
      await dataService.deleteQuestionTargetById(editTarget.id);
      onClose();
    } catch (e: any) {
      setErrorText(e?.message || 'Hedef silinemedi.');
      setIsSaving(false);
      setConfirmDelete(false);
    }
  };

  const who =
    kind === 'class'
      ? selectedClass
        ? `${selectedClass.name} sınıfı (${classStudents.length} öğrenci)`
        : 'Sınıf seçilmedi'
      : selectedStudent
        ? selectedStudent.name
        : 'Öğrenci seçilmedi';

  return (
    <Modal
      open
      id="question-target-modal"
      onClose={requestClose}
      icon={Target}
      tone="warning"
      size="lg"
      title={isEdit ? 'Soru Hedefini Düzenle' : 'Soru Hedefi Ver'}
      description={isEdit ? `${who}${editTarget?.assignedByTeacherName ? ` · Veren: ${editTarget.assignedByTeacherName}` : ''}` : 'Öğrenciye ya da sınıfa belirli tarihler için soru hedefi'}
      footer={
        confirmDiscard ? (
          <DiscardBar onKeep={() => setConfirmDiscard(false)} onDiscard={onClose} />
        ) : confirmDelete ? (
          <div role="alert" className="w-full flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Bu hedef silinsin mi? Öğrenci artık bu hedefi görmez.
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="ui-btn ui-btn-secondary ui-btn-sm">
                Vazgeç
              </button>
              <button type="button" id="qt-delete-confirm" onClick={handleDelete} disabled={isSaving} className="ui-btn ui-btn-danger ui-btn-sm">
                Evet, sil
              </button>
            </span>
          </div>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              {isEdit && canEdit && (
                <button type="button" id="qt-delete" onClick={() => setConfirmDelete(true)} className="ui-btn ui-btn-ghost text-danger-fg">
                  <Trash2 className="w-4 h-4" /> Sil
                </button>
              )}
              <span className="text-[11px] text-muted truncate" id="qt-form-summary">
                {who} · {days >= 1 ? `${shortTrDate(start)} – ${shortTrDate(end)} (${days} gün)` : 'tarih seçilmedi'}
              </span>
            </span>
            <span className="flex gap-2 ml-auto">
              <button type="button" onClick={requestClose} className="ui-btn ui-btn-secondary">
                İptal
              </button>
              <button type="button" id="qt-save" onClick={handleSave} disabled={isSaving || !canEdit} className="ui-btn ui-btn-primary">
                <Save className="w-4 h-4" />
                {isSaving ? 'Kaydediliyor…' : isEdit || conflict ? 'Hedefi Güncelle' : 'Hedefi Kaydet'}
              </button>
            </span>
          </div>
        )
      }
    >
      <div className="space-y-6">
        {!canEdit && (
          <div className="flex items-start gap-2 rounded-xl bg-warning-soft text-warning-fg px-3 py-2 text-xs font-semibold">
            <Info className="w-4 h-4 shrink-0" />
            Bu hedefi {editTarget?.assignedByTeacherName || 'başka bir öğretmen'} verdi. Yalnızca o öğretmen veya yönetici değiştirebilir.
          </div>
        )}

        <FormSection title="1. Kime">
          {!isEdit && (
            <Segmented
              value={kind}
              onChange={(v) => setKind(v)}
              items={[
                { value: 'student', label: 'Öğrenciye', icon: User, id: 'qt-kind-student' },
                { value: 'class', label: 'Sınıfa', icon: Users, id: 'qt-kind-class' },
              ]}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="qt-class">Sınıf</FieldLabel>
              <select
                id="qt-class"
                value={classId}
                disabled={isEdit}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStudentId('');
                }}
                className={inputCls}
              >
                <option value="">Sınıf seçin</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({students.filter((s) => s.classId === c.id).length} öğrenci)
                  </option>
                ))}
              </select>
            </div>
            {kind === 'student' && (
              <div>
                <FieldLabel htmlFor="qt-student">Öğrenci</FieldLabel>
                <select
                  id="qt-student"
                  value={studentId}
                  disabled={isEdit || !classId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{classId ? 'Öğrenci seçin' : 'Önce sınıf seçin'}</option>
                  {classStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.studentNumber ? ` (${s.studentNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {kind === 'class' && classId && (
            <p className="text-[11px] text-muted">Sınıf hedefi sınıftaki tüm öğrencilere görünür; sınıfa sonradan katılan öğrenciler de görür.</p>
          )}
        </FormSection>

        <FormSection title="2. Ders" hint={mySubjects ? 'Branşınıza göre' : undefined}>
          {fixedSubject || (allowGeneral && subjectOptions.length === 0) ? (
            <div id="qt-subject-fixed" className="px-3 py-2 rounded-xl bg-surface-2 border border-line text-sm font-semibold text-fg">
              {effectiveSubject || 'Tüm dersler (genel hedef)'}
            </div>
          ) : (
            <SubjectMultiSelect id="qt-subject" options={subjectOptions} value={selectedSubjects} onChange={setSubjectsSel} allowAll={allowGeneral} />
          )}
          <p className="text-[11px] text-muted" id="qt-subject-hint">
            {effectiveSubject
              ? `Yalnızca ${effectiveSubject} soruları bu hedefe sayılır.`
              : 'Öğrencinin tüm derslerde çözdüğü sorular bu hedefe sayılır.'}
            {!fixedSubject && ' Listeyi açıp kutucuklarla birden çok ders seçebilirsiniz.'}
          </p>
        </FormSection>

        <FormSection title="3. Tarihler">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                id={`qt-preset-${p.id}`}
                className={chipCls(presets.find((x) => x.s === start && x.e === end)?.id === p.id)}
                onClick={() => {
                  setDaysDraft(null);
                  applyDates(p.s, p.e);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_1fr] gap-3">
            <div>
              <FieldLabel htmlFor="qt-start">Başlangıç</FieldLabel>
              <input
                id="qt-start"
                type="date"
                value={start}
                onChange={(e) => {
                  // Gün sayısı korunur: başlangıç kayınca bitiş de kayar
                  const ns = e.target.value;
                  const s0 = parseYmd(ns);
                  if (s0 && days >= 1) applyDates(ns, localDateStr(addDays(s0, days - 1)));
                  else applyDates(ns, end < ns ? ns : end);
                }}
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel htmlFor="qt-days-input">Gün sayısı</FieldLabel>
              <div className="relative">
                <input
                  id="qt-days-input"
                  inputMode="numeric"
                  value={daysDraft ?? (days >= 1 ? String(days) : '')}
                  onChange={(e) => onDaysChange(e.target.value)}
                  onBlur={() => setDaysDraft(null)}
                  className={`${inputCls} pr-10`}
                  placeholder="7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">gün</span>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="qt-end">Bitiş</FieldLabel>
              <input
                id="qt-end"
                type="date"
                value={end}
                min={start}
                onChange={(e) => {
                  setDaysDraft(null);
                  applyDates(start, e.target.value);
                }}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted" id="qt-days">
            {daysDraft !== null && !(toInt(daysDraft) >= 1 && toInt(daysDraft) <= 366)
              ? 'Gün sayısı 1 ile 366 arasında olmalı.'
              : days >= 1
                ? `${days} günlük hedef · ${shortTrDate(start)} – ${shortTrDate(end)}`
                : 'Bitiş tarihi başlangıçtan önce olamaz.'}
          </p>
        </FormSection>

        <FormSection title="4. Soru hedefi">
          {planCounts && (
            <div
              id="qt-plan-ghost"
              role="note"
              className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/40 px-3 py-2 text-xs text-fg-2 opacity-90"
              title="Öğrencinin haftalık planlarında bu tarihlerde verilmiş soru sayıları (bütün öğretmenler). Hedefi verirken dikkate alın."
            >
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand-fg">
                <ClipboardList className="w-3.5 h-3.5" /> Haftalık planda:
              </span>{' '}
              <span className="font-bold text-fg">
                {kind === 'student' && selectedStudent ? `${selectedStudent.name.split(' ')[0]} — ` : ''}
                {kind === 'class' && planGhostInfo ? 'öğrenci başına ortalama ' : ''}
                {ghostText(planCounts.bySubject)} soru
              </span>
              <span className="block text-[11px] text-muted mt-0.5">
                {kind === 'class' && planGhostInfo
                  ? `${planGhostInfo.total} öğrencinin ${planGhostInfo.withPlan} tanesinin planında soru var. `
                  : ''}
                Bu sayılar plandan öğrencinin hedeflerine zaten aktarılır; vereceğiniz hedefi buna göre ayarlayın.
              </span>
            </div>
          )}
          {/* Günlere dağıtım: eşit ya da gün gün farklı */}
          <div className="flex flex-wrap items-center gap-2" id="qt-dist-mode">
            <span className="text-xs font-semibold text-fg">Günlere dağıtım:</span>
            <button
              type="button"
              id="qt-dist-even"
              className={chipCls(!isCustom)}
              onClick={() => switchDistMode('even')}
            >
              Her gün eşit
            </button>
            <button
              type="button"
              id="qt-dist-custom"
              className={chipCls(isCustom)}
              disabled={!customAllowed}
              title={customAllowed ? 'Her güne ayrı soru sayısı yazın' : `Gün gün dağıtım en fazla ${MAX_CUSTOM_DAYS} günlük hedeflerde kullanılabilir`}
              onClick={() => switchDistMode('custom')}
            >
              Gün gün farklı
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="qt-daily">{isCustom ? 'Günlük (ortalama)' : 'Günlük'}</FieldLabel>
              <div className="relative">
                <input
                  id="qt-daily"
                  inputMode="numeric"
                  value={shownDaily}
                  readOnly={isCustom}
                  onChange={(e) => onDailyChange(e.target.value)}
                  className={`${inputCls} pr-16 ${isCustom ? 'opacity-70 cursor-not-allowed' : ''}`}
                  placeholder="50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">soru/gün</span>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="qt-total">Toplam ({days >= 1 ? days : '-'} gün)</FieldLabel>
              <div className="relative">
                <input
                  id="qt-total"
                  inputMode="numeric"
                  value={shownTotal}
                  readOnly={isCustom}
                  onChange={(e) => onTotalChange(e.target.value)}
                  className={`${inputCls} pr-12 ${isCustom ? 'opacity-70 cursor-not-allowed' : ''}`}
                  placeholder="350"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">soru</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            {isCustom
              ? 'Gün gün modunda toplam, aşağıdaki günlerin toplamıdır; günlük kutusu ortalamayı gösterir.'
              : 'Birini değiştirince diğeri gün sayısına göre otomatik hesaplanır.'}
          </p>

          {isCustom && (
            <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-2" id="qt-day-rows">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-fg">Gün gün soru sayısı</div>
                <button
                  type="button"
                  id="qt-day-even"
                  onClick={() => setDayRows(spreadEvenly(customTotal >= 1 ? customTotal : toInt(total) || 0))}
                  className="ui-btn ui-btn-ghost ui-btn-sm"
                  title="Toplamı günlere eşit böl"
                >
                  <Divide className="w-3.5 h-3.5" /> Eşit dağıt
                </button>
              </div>
              <p className="text-[11px] text-muted">Her güne istediğiniz sayıyı yazın. 0 yazılan gün dinlenme günü sayılır.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {rangeDates.map((d) => {
                  const dt = parseYmd(d);
                  return (
                    <label key={d} className="flex items-center gap-2 rounded-lg bg-surface border border-line px-2 py-1.5" data-testid="qt-day-row">
                      <span className="text-[11px] font-semibold text-fg w-14 shrink-0 leading-tight">
                        {shortTrDate(d)}
                        <span className="block text-muted font-normal">{dt ? DAY_NAMES[dt.getDay()] : ''}</span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <input
                          aria-label={`${shortTrDate(d)} soru sayısı`}
                          inputMode="numeric"
                          value={dayRows[d] ?? ''}
                          placeholder="0"
                          onChange={(e) => setDayRow(d, e.target.value)}
                          className={`${inputCls} text-center px-1 ${planTopics[d] && !(dayRows[d] ?? '').trim() ? 'ring-2 ring-warning/50' : ''}`}
                        />
                        {planTopics[d] && (
                          <span className="block mt-1 text-[10px] leading-tight text-muted break-words" title={planTopics[d]} data-testid="qt-day-topic">
                            {planTopics[d]}
                          </span>
                        )}
                        {planCounts?.byDay[d] && (
                          <span className="block mt-1 text-[10px] leading-tight font-semibold text-brand-fg/80" data-testid="qt-day-plan-count" title="Haftalık plandaki soru sayıları">
                            Plan: {ghostText(planCounts.byDay[d])}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] font-semibold text-fg" id="qt-day-sum">
                Toplam: {customTotal} soru · ortalama günde {days >= 1 ? Math.round(customTotal / days) : 0}
              </p>
            </div>
          )}

          {showBreakdown && (
            <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-2" id="qt-breakdown">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-fg">Ders dağılımı (isteğe bağlı)</div>
                {breakdownRows.length > 1 && (
                  <button type="button" id="qt-breakdown-even" onClick={distributeEvenly} className="ui-btn ui-btn-ghost ui-btn-sm">
                    <Divide className="w-3.5 h-3.5" /> Eşit dağıt
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted">
                {multi
                  ? 'Seçtiğiniz derslerin her biri için ayrı soru sayısı yazabilirsiniz. Boş bırakılan derse ayrı hedef konmaz.'
                  : 'İsterseniz bazı dersler için ayrı soru sayısı belirleyin. Boş bırakılan derse ayrı hedef konmaz.'}
              </p>
              {breakdownRows.map(([s, v]) => (
                <div key={s} className="flex items-center gap-2" data-testid="qt-breakdown-row">
                  <span className="flex-1 text-sm text-fg truncate">{s}</span>
                  <div className="relative w-32 shrink-0">
                    <input
                      aria-label={`${s} hedefi`}
                      inputMode="numeric"
                      value={v}
                      placeholder="-"
                      onChange={(e) => setRow(s, e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                      className={`${inputCls} text-center pr-10`}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted">soru</span>
                  </div>
                  {!multi && (
                    <button
                      type="button"
                      aria-label={`${s} kaldır`}
                      onClick={() =>
                        setSubjectRows((r) => {
                          const c = { ...r };
                          delete c[s];
                          return c;
                        })
                      }
                      className="ui-btn ui-btn-ghost ui-btn-icon"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {breakdownRows.length > 0 && (
                <p className="text-[11px] text-muted" id="qt-breakdown-sum">
                  Dağıtılan: {Object.values(breakdownTargets).reduce((a, b) => a + b, 0)} / {toInt(shownTotal) || 0} soru
                </p>
              )}
              {!multi && breakdownSubjects.length > 0 && (
                <div className="flex items-center gap-2">
                  <select id="qt-breakdown-subject" value={subjectToAdd} onChange={(e) => setSubjectToAdd(e.target.value)} className={inputCls}>
                    <option value="">Ders ekle…</option>
                    {breakdownSubjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    id="qt-breakdown-add"
                    disabled={!subjectToAdd}
                    onClick={() => {
                      if (!subjectToAdd) return;
                      setSubjectRows((r) => ({ ...r, [subjectToAdd]: '' }));
                      setSubjectToAdd('');
                    }}
                    className="ui-btn ui-btn-secondary shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Ekle
                  </button>
                </div>
              )}
            </div>
          )}
        </FormSection>

        <FormSection title="5. Not ve e-posta">
          <div>
            <FieldLabel htmlFor="qt-notes" optional>
              Öğrenciye not
            </FieldLabel>
            <textarea
              id="qt-notes"
              rows={2}
              maxLength={400}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Yeni nesil sorulara ağırlık verelim."
              className={`${inputCls} resize-y`}
            />
          </div>
          <MailOptIn
            id="qt-send-mail"
            checked={sendMail}
            onChange={setSendMail}
            label={kind === 'class' ? 'Sınıftaki öğrencilere e-posta gönder' : 'Öğrenciye e-posta gönder'}
            hint="E-postası kayıtlı öğrencilere hedef, tarihler ve notunuz gider. Hiçbir şey değişmediyse tekrar gönderilmez."
          />
        </FormSection>

        {conflict && (
          <div id="qt-conflict" className="flex items-start gap-2 rounded-xl bg-info-soft text-info-fg px-3 py-2 text-xs font-semibold">
            <Info className="w-4 h-4 shrink-0" />
            Bu tarihlerde aynı {conflict.targetType === 'class' ? 'sınıfa' : 'öğrenciye'} verdiğiniz bir hedef var ({shortTrDate(conflict.weekStartDate || '')} –{' '}
            {shortTrDate(dataService.questionTargetEnd(conflict))}, {conflict.targetQuestions} soru). Kaydederseniz o hedef güncellenir.
          </div>
        )}
        {errorText && (
          <div id="qt-form-error" role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorText}
          </div>
        )}
      </div>
    </Modal>
  );
};
