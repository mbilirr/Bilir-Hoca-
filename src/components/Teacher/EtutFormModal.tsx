import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Copy, Edit3, Save, AlertCircle, AlertTriangle, Users, Repeat, Settings2 } from 'lucide-react';
import type { ClassGroup, Etut, Student } from '../../types';
import { dataService, type EtutTeacherOption } from '../../services/dataService';
import { Modal, cx } from '../ui/kit';
import { normalizeSubject, subjectsForBranch, subjectsForLevel, zumreOf } from '../../lib/subjects';
import { EtutTeacherSelect, type TeacherGroup } from './EtutTeacherSelect';
import {
  FormSection,
  FieldLabel,
  inputCls,
  chipCls,
  classLevel,
  localDateStr,
  addDays,
  shortTrDate,
  DiscardBar,
  MailOptIn,
  StudentPicker,
} from './FormParts';

// ============================================================================
// Etüt oluştur / düzenle penceresi (Aşama 9)
// 1) Ders ve etüt öğretmeni  2) Konu  3) Öğrenciler  4) Zaman, yer, tekrar  5) E-posta
// Yönetici olmayan öğretmen yalnızca kendi branşının dersini ve o branşın öğretmenlerini görür.
// ============================================================================

export interface EtutChange {
  label: string;
  from: string;
  to: string;
}
export interface EtutFormSaved {
  mode: 'create' | 'edit' | 'copy';
  etuts: Etut[];
  sendMail: boolean;
  changes?: EtutChange[];
  previousTeacherId?: string | null;
  previousTeacherIds?: string[] | null;
  failedCount?: number;
  mailScheduled?: boolean; // Aşama 19: e-postalar etüt gününde otomatik gidecek
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit' | 'copy';
  source?: Etut | null;
  initialDate?: string | null;
  students: Student[];
  classes: ClassGroup[];
  etuts: Etut[];
  onClose: () => void;
  onSaved: (r: EtutFormSaved) => void;
  onManageTeachers?: () => void;
  teacherListVersion?: number;
}

const LESSON_PERIODS = ['1. Ders', '2. Ders', '3. Ders', '4. Ders', '5. Ders', '6. Ders', '7. Ders', '8. Ders', '9. Ders', '10. Ders'];
const DURATIONS = [30, 40, 45, 60, 80, 90];
const DEFAULT_DURATION = 40;

const toMin = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : NaN;
};
const fromMin = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

const prefsKey = () => `edu_etut_form_prefs_${dataService.getCurrentTeacher()?.id || 'x'}`;
function readPrefs(): { subject?: string; location?: string; duration?: number; teacherBySubject?: Record<string, string> } {
  try {
    return JSON.parse(localStorage.getItem(prefsKey()) || '{}') || {};
  } catch {
    return {};
  }
}
function writePrefs(p: ReturnType<typeof readPrefs>) {
  try {
    localStorage.setItem(prefsKey(), JSON.stringify({ ...readPrefs(), ...p }));
  } catch {}
}

export const EtutFormModal: React.FC<Props> = (props) =>
  props.open ? <EtutFormContent key={`${props.mode}-${props.source?.id || props.initialDate || 'new'}`} {...props} /> : null;

const EtutFormContent: React.FC<Props> = ({
  mode,
  source,
  initialDate,
  students,
  classes,
  etuts,
  onClose,
  onSaved,
  onManageTeachers,
  teacherListVersion = 0,
}) => {
  const isEdit = mode === 'edit' && !!source;
  const isCopy = mode === 'copy' && !!source;
  const me = dataService.getCurrentTeacher();
  const isAdmin = dataService.isCurrentUserAdmin();
  const mySubjects = dataService.getMySubjects();
  const prefs = useMemo(readPrefs, []);

  // ---- öğretmen seçenekleri (veritabanından; yönetici olmayana yalnızca kendi branşı gelir)
  const [teacherOptions, setTeacherOptions] = useState<EtutTeacherOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    dataService.getEtutTeacherOptions().then((list) => alive && setTeacherOptions(list));
    return () => {
      alive = false;
    };
  }, [teacherListVersion]);

  // ---- başlangıç değerleri
  const initial = useMemo(() => {
    const allIds = students.map((s) => s.id);
    const sel = source
      ? source.assignedStudentIds === 'all'
        ? allIds
        : (source.assignedStudentIds || []).filter((id) => allIds.includes(id))
      : [];
    return {
      subject: source ? normalizeSubject(source.subject) : '',
      teacherId: source?.teacherId || '',
      teacherName: source?.teacherName || '',
      teacherIds: source ? (source.teacherIds && source.teacherIds.length ? source.teacherIds : source.teacherId ? [source.teacherId] : []) : [],
      teacherNames: source?.teacherNames || [],
      topic: source?.topic || '',
      notes: source?.notes || '',
      selected: sel,
      date: isCopy ? initialDate || '' : source?.date || initialDate || localDateStr(new Date()),
      time: source?.time || '',
      lessonPeriod: source?.lessonPeriod && source.lessonPeriod !== 'Ders' ? source.lessonPeriod : '',
      duration: Number(source?.duration) || prefs.duration || 40,
      location: source ? source.location || '' : prefs.location || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- ders seçenekleri
  const subjectOptions = useMemo(() => {
    let list: string[];
    if (mySubjects) list = [...mySubjects];
    else {
      const levels = Array.from(new Set(classes.map((c) => classLevel(c))));
      const base = levels.length === 1 ? subjectsForLevel(levels[0]) : subjectsForLevel(null);
      const fromTeachers = (teacherOptions || []).flatMap((o) => o.subjects);
      list = Array.from(new Set([...base, ...fromTeachers]));
    }
    if ((isEdit || isCopy) && initial.subject && !list.includes(initial.subject)) list.push(initial.subject);
    return list;
  }, [mySubjects, classes, teacherOptions, isEdit, isCopy, initial.subject]);
  const [subject, setSubject] = useState<string>(() => {
    const cands = [initial.subject, prefs.subject, ...subjectsForBranch(me?.branch)].filter(Boolean) as string[];
    return cands[0] || '';
  });
  const effectiveSubject = subjectOptions.includes(subject) ? subject : subjectOptions[0] || '';

  const [teacherIds, setTeacherIds] = useState<string[]>(initial.teacherIds);
  const [topic, setTopic] = useState(initial.topic);
  const [notes, setNotes] = useState(initial.notes);
  const [filterClassIds, setFilterClassIds] = useState<string[]>(() => {
    const first = students.find((s) => initial.selected.includes(s.id));
    return first && classes.some((c) => c.id === first.classId) ? [first.classId] : classes.length === 1 ? [classes[0].id] : [];
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(initial.selected);
  const [date, setDate] = useState(initial.date);
  const [lessonPeriod, setLessonPeriod] = useState(initial.lessonPeriod);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState<number>(initial.duration);
  const [location, setLocation] = useState(initial.location);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [sendMail, setSendMail] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (errorText || conflicts) document.getElementById('etut-form-alert')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errorText, conflicts]);

  // ---- bu dersin ve aynı zümrenin öğretmenleri (Aşama 12: Fen seçilince Fizik/Kimya/Biyoloji öğretmenleri de)
  const zumre = useMemo(() => zumreOf(effectiveSubject), [effectiveSubject]);
  const subjectTeachers = useMemo(() => {
    const list = (teacherOptions || []).filter((o) => o.isMe || o.subjects.some((s) => zumre.subjects.includes(s)));
    // düzenlenen etüdün mevcut öğretmenleri listede yoksa kaybolmasın
    if (isEdit || isCopy) {
      initial.teacherIds.forEach((id, i) => {
        if (list.some((o) => o.id === id)) return;
        const name = initial.teacherNames[i] || (initial.teacherIds.length === 1 ? initial.teacherName : '') || 'Mevcut öğretmen';
        list.push({ id, name, subjects: [effectiveSubject], kind: id.startsWith('ext-') ? 'external' : 'system', hasEmail: true, rowId: null, isMe: false });
      });
    }
    if (me && !list.some((o) => o.isMe || o.id === me.id)) {
      list.unshift({ id: me.id, name: me.name, subjects: subjectsForBranch(me.branch), kind: 'system', hasEmail: !!me.email, rowId: null, isMe: true });
    }
    return list.sort((a, b) => (a.isMe === b.isMe ? (a.kind === b.kind ? a.name.localeCompare(b.name, 'tr') : a.kind === 'system' ? -1 : 1) : a.isMe ? -1 : 1));
  }, [teacherOptions, effectiveSubject, zumre, isEdit, isCopy, initial.teacherIds, initial.teacherNames, initial.teacherName, me]);

  // Ders değişince: o ders için son seçilen öğretmen, yoksa (kendi dersiyse) öğretmenin kendisi
  useEffect(() => {
    if (!teacherOptions) return;
    const keep = teacherIds.filter((id) => subjectTeachers.some((o) => o.id === id));
    if (keep.length) {
      if (keep.length !== teacherIds.length) setTeacherIds(keep);
      return;
    }
    const remembered = prefs.teacherBySubject?.[effectiveSubject];
    const pick =
      subjectTeachers.find((o) => o.id === remembered) ||
      subjectTeachers.find((o) => o.isMe && o.subjects.includes(effectiveSubject)) ||
      (subjectTeachers.filter((o) => !o.isMe).length === 1 ? subjectTeachers.find((o) => !o.isMe) : undefined) ||
      subjectTeachers.find((o) => o.isMe);
    setTeacherIds(pick ? [pick.id] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSubject, teacherOptions]);

  const selectedTeachers = teacherIds.map((id) => subjectTeachers.find((o) => o.id === id)).filter(Boolean) as EtutTeacherOption[];
  const selectedTeacher = selectedTeachers[0] || null; // ana öğretmen (ilk sıradaki)
  const teacherNamesText = selectedTeachers.map((o) => o.name).join(', ');
  // Açılır listedeki gruplar: önce seçilen dersin öğretmenleri, sonra zümredeki her dersin öğretmenleri
  const teacherGroups: TeacherGroup[] = useMemo(() => {
    const order = [effectiveSubject, ...zumre.subjects.filter((s) => s !== effectiveSubject)].filter(Boolean);
    const used = new Set<string>();
    const groups: TeacherGroup[] = [];
    for (const subj of order) {
      const opts = subjectTeachers.filter((o) => !used.has(o.id) && o.subjects.includes(subj));
      opts.forEach((o) => used.add(o.id));
      if (opts.length) groups.push({ key: `s:${subj}`, title: `${subj} öğretmenleri`, options: opts });
    }
    const rest = subjectTeachers.filter((o) => !used.has(o.id));
    if (rest.length) {
      if (groups.length && groups[0].key === `s:${effectiveSubject}`) groups[0] = { ...groups[0], options: [...rest, ...groups[0].options] };
      else groups.unshift({ key: `s:${effectiveSubject || 'diger'}`, title: `${effectiveSubject || 'Ders'} öğretmenleri`, options: rest });
    }
    return groups;
  }, [subjectTeachers, effectiveSubject, zumre]);

  // ---- ders saati -> saat (daha önceki etütlerden öğrenilir)
  const periodTimes = useMemo(() => {
    const map: Record<string, string> = {};
    [...etuts]
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      .forEach((e) => {
        if (e.lessonPeriod && e.lessonPeriod !== 'Ders' && e.time) map[e.lessonPeriod] = e.time;
      });
    return map;
  }, [etuts]);
  const locationSuggestions = useMemo(
    () => Array.from(new Set(etuts.map((e) => (e.location || '').trim()).filter((l) => l && l !== 'Derslik'))).slice(0, 25),
    [etuts]
  );

  // ---- tekrar eden tarihler
  const occurrences = useMemo(() => {
    if (!date) return [];
    const [y, m, d] = date.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const n = isEdit ? 1 : Math.max(1, Math.min(12, repeatWeeks));
    return Array.from({ length: n }, (_, i) => localDateStr(addDays(base, i * 7)));
  }, [date, repeatWeeks, isEdit]);

  // Aşama 19: kopyalanan / birden çok haftaya tekrarlanan etütlerde e-posta kaydederken gitmez;
  // etüt gününde (saatten 1 saat önce, saat yoksa 08:00) otomatik gider.
  // Aşama 22: tek bir yeni etüt de BUGÜNDEN SONRAKİ bir güne tanımlanırsa aynı şekilde zamanlanır;
  // yalnızca bugüne tanımlanan tek etütte e-posta kaydedilince hemen gider.
  const isFutureDay = !!date && date > localDateStr(new Date());
  const scheduledMail = !isEdit && (isCopy || occurrences.length > 1 || isFutureDay);
  const editScheduled = isEdit && !!source?.mailMode;

  const dirty =
    topic !== initial.topic ||
    notes !== initial.notes ||
    selectedIds.length !== initial.selected.length ||
    date !== initial.date ||
    time !== initial.time ||
    location !== initial.location ||
    (isEdit && (teacherIds.join('|') !== initial.teacherIds.join('|') || effectiveSubject !== initial.subject));

  const requestClose = () => {
    if (isSaving) return;
    if (dirty && !confirmDiscard) return setConfirmDiscard(true);
    onClose();
  };

  // ---- çakışma kontrolü (aynı öğretmen veya aynı öğrenci, aynı gün, kesişen saat)
  const findConflicts = (): string[] => {
    // Aşama 16: saat girilmediyse çakışma denetlenemez
    if (!/^\d{2}:\d{2}$/.test(time)) return [];
    const start = toMin(time);
    const end = start + (Number(duration) || 40);
    const sel = new Set(selectedIds);
    const out: string[] = [];
    for (const day of occurrences) {
      for (const e of etuts) {
        if (isEdit && source && e.id === source.id) continue;
        if (e.date !== day) continue;
        const s2 = toMin(e.time);
        const e2 = s2 + (Number(e.duration) || 45);
        if (!(start < e2 && s2 < end)) continue;
        const theirs = e.teacherIds && e.teacherIds.length ? e.teacherIds : e.teacherId ? [e.teacherId] : [];
        const busy = selectedTeachers.filter((o) => theirs.includes(o.id));
        const sameTeacher = busy.length > 0;
        const shared = Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds.filter((id) => sel.has(id)) : [];
        if (!sameTeacher && shared.length === 0) continue;
        const who = [
          sameTeacher ? `${busy.map((o) => o.name).join(', ')} aynı saatte` : '',
          shared.length
            ? `${shared
                .slice(0, 3)
                .map((id) => students.find((s) => s.id === id)?.name || 'öğrenci')
                .join(', ')}${shared.length > 3 ? ` +${shared.length - 3}` : ''}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
        out.push(`${shortTrDate(day)} ${e.time} – ${e.subject}: ${e.topic} (${who})`);
      }
    }
    return out.slice(0, 6);
  };

  const handleSubmit = async (force = false) => {
    if (isSaving) return;
    setErrorText(null);
    setConfirmDiscard(false);
    if (!effectiveSubject) return setErrorText('Ders seçin.');
    if (!selectedTeacher) return setErrorText('Etüt öğretmenini seçin.');
    if (!topic.trim()) return setErrorText('Etüt konusunu yazın.');
    if (selectedIds.length === 0) return setErrorText('En az bir öğrenci seçin.');
    if (!date) return setErrorText('Tarih seçin.');
    // Aşama 16: zaman ve yer bölümünde yalnız tarih zorunlu; saat, süre ve yer isteğe bağlı
    const hasTime = /^\d{2}:\d{2}$/.test(time);
    if (time && !hasTime) return setErrorText('Başlangıç saati geçersiz. Silebilir ya da yeniden seçebilirsiniz.');
    const dur = Number(duration) || DEFAULT_DURATION;
    if (dur < 10 || dur > 300) return setErrorText('Süre 10 ile 300 dakika arasında olmalı (boş bırakılırsa 40 dk sayılır).');
    if (!isEdit) {
      if (hasTime && new Date(`${date}T${time}:00`).getTime() < Date.now() - 5 * 60000) {
        return setErrorText('Geçmiş bir saate etüt planlanamaz.');
      }
      if (!hasTime && date < localDateStr(new Date())) return setErrorText('Geçmiş bir güne etüt planlanamaz.');
    }
    if (!force) {
      const found = findConflicts();
      if (found.length) {
        setConflicts(found);
        return;
      }
    }
    setConflicts(null);

    const chosenStudents = students.filter((s) => selectedIds.includes(s.id));
    const levels = Array.from(new Set(chosenStudents.map((s) => classLevel(classes.find((c) => c.id === s.classId)))));
    const gradeLabel = Array.from(new Set(chosenStudents.map((s) => classes.find((c) => c.id === s.classId)?.name || s.className))).slice(0, 4).join(', ');
    const payload: Partial<Etut> = {
      subject: effectiveSubject,
      topic: topic.trim(),
      notes: notes.trim(),
      time: hasTime ? time : '',
      duration: dur,
      location: location.trim(),
      lessonPeriod: lessonPeriod || 'Ders',
      teacherId: selectedTeacher.id,
      teacherName: teacherNamesText,
      teacherIds: selectedTeachers.map((o) => o.id),
      teacherNames: selectedTeachers.map((o) => o.name),
      teacherBranch: effectiveSubject,
      assignedStudentIds: selectedIds,
      schoolLevel: levels.length === 1 ? levels[0] : undefined,
      gradeLevel: gradeLabel || undefined,
    };

    setIsSaving(true);
    writePrefs({
      subject: effectiveSubject,
      location: payload.location,
      duration: dur,
      teacherBySubject: { ...(prefs.teacherBySubject || {}), [effectiveSubject]: selectedTeacher.id },
    });
    try {
      if (isEdit && source) {
        const changes: EtutChange[] = [];
        const cmp = (label: string, a: any, b: any) => {
          if (String(a ?? '') !== String(b ?? '')) changes.push({ label, from: String(a ?? ''), to: String(b ?? '') });
        };
        cmp('Ders', normalizeSubject(source.subject), payload.subject);
        cmp('Konu', source.topic, payload.topic);
        cmp('Tarih', shortTrDate(source.date), shortTrDate(date));
        cmp('Saat', source.time, payload.time);
        cmp('Süre', `${source.duration} dk`, `${dur} dk`);
        cmp('Yer', source.location, payload.location);
        const prevCount = Array.isArray(source.assignedStudentIds) ? source.assignedStudentIds.length : students.length;
        cmp('Öğrenci sayısı', prevCount, selectedIds.length);
        const prevIds = initial.teacherIds;
        const nowIds = selectedTeachers.map((o) => o.id);
        const teacherChanged = prevIds.length !== nowIds.length || prevIds.some((id) => !nowIds.includes(id));
        await dataService.updateEtut(source.id, { ...payload, date });
        onSaved({
          mode: 'edit',
          etuts: [{ ...source, ...payload, date } as Etut],
          // Zamanlı e-posta kullanan (kopyalanmış) etütte değişiklik e-postası gitmez
          sendMail: !source.mailMode && sendMail && (changes.length > 0 || teacherChanged),
          changes,
          previousTeacherId: teacherChanged ? source.teacherId || null : null,
          previousTeacherIds: teacherChanged ? prevIds : null,
        });
      } else {
        const created: Etut[] = [];
        const groupId = occurrences.length > 1 ? `tekrar-${Date.now().toString(36)}` : undefined;
        let failed = 0;
        for (const day of occurrences) {
          try {
            const e = await dataService.createEtut({
              ...(payload as Etut),
              date: day,
              recurrenceGroupId: groupId,
              mailMode: scheduledMail ? (sendMail ? 'scheduled' : 'off') : undefined,
            });
            created.push(e);
          } catch {
            failed++;
            break;
          }
        }
        if (created.length === 0) throw new Error('Etüt kaydedilemedi (yetki veya bağlantı sorunu). Lütfen tekrar deneyin.');
        onSaved({
          mode: isCopy ? 'copy' : 'create',
          etuts: created,
          sendMail: scheduledMail ? false : sendMail,
          mailScheduled: scheduledMail && sendMail,
          failedCount: occurrences.length - created.length,
        });
        void failed;
      }
    } catch (err: any) {
      setErrorText(err?.message?.replace(/^\[\w+\]\s*/, '') || 'Etüt kaydedilemedi. Lütfen tekrar deneyin.');
      setIsSaving(false);
    }
  };

  const today = localDateStr(new Date());
  const tomorrow = localDateStr(addDays(new Date(), 1));
  // Kopyada: kaynağın tarihinden itibaren bugünden sonraki ilk aynı gün
  const sourceNextWeek = (() => {
    if (!isCopy || !source?.date) return '';
    const [y, m, d] = source.date.split('-').map(Number);
    if (!y) return '';
    let dt = new Date(y, m - 1, d);
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    do dt = addDays(dt, 7);
    while (dt < t0);
    return localDateStr(dt);
  })();
  const endLabel = /^\d{2}:\d{2}$/.test(time) ? fromMin(toMin(time) + (Number(duration) || 0)) : '';

  return (
    <Modal
      open
      id="etut-form-modal"
      onClose={requestClose}
      icon={isEdit ? Edit3 : isCopy ? Copy : CalendarDays}
      tone="info"
      size="lg"
      title={isEdit ? 'Etüdü Düzenle' : isCopy ? 'Etüdü Kopyala' : 'Yeni Etüt'}
      description={
        isEdit
          ? `${source?.subject} – ${source?.topic}`
          : isCopy
            ? `"${source?.topic}" (${shortTrDate(source?.date || '')} ${source?.time || ''}) etüdünden; yeni tarihi seçin, istediğinizi değiştirin`
            : 'Ders ve öğretmeni seçin, öğrencileri ekleyin'
      }
      footer={
        confirmDiscard ? (
          <DiscardBar onKeep={() => setConfirmDiscard(false)} onDiscard={onClose} />
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted truncate max-w-full sm:max-w-[55%]" id="etut-form-summary">
              {selectedTeacher ? teacherNamesText : 'Öğretmen seçilmedi'} · {selectedIds.length} öğrenci
              {date ? ` · ${shortTrDate(date)}${time ? ` ${time}` : ''}` : ''}
              {occurrences.length > 1 ? ` · ${occurrences.length} hafta` : ''}
            </span>
            <span className="flex gap-2 ml-auto">
              <button type="button" onClick={requestClose} className="ui-btn ui-btn-secondary">
                İptal
              </button>
              <button type="button" id="etut-form-save" onClick={() => handleSubmit(false)} disabled={isSaving} className="ui-btn ui-btn-primary">
                <Save className="w-4 h-4" />
                {isSaving
                  ? 'Kaydediliyor…'
                  : isEdit
                    ? 'Değişiklikleri Kaydet'
                    : occurrences.length > 1
                      ? `${occurrences.length} Etüdü Kaydet`
                      : 'Etüdü Kaydet'}
              </button>
            </span>
          </div>
        )
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(false);
        }}
        className="space-y-6"
        noValidate
      >
        {/* 1. DERS VE ÖĞRETMEN */}
        <FormSection title="1. Ders ve etüt öğretmeni" hint={mySubjects ? 'Branşınıza göre sınırlı' : undefined}>
          {subjectOptions.length <= 1 ? (
            <div id="etut-subject-fixed" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-line text-sm font-semibold text-fg">
              <CalendarDays className="w-4 h-4 text-info-fg" />
              {effectiveSubject || 'Branş bilgisi yok'}
            </div>
          ) : (
            <div>
              <FieldLabel htmlFor="etut-subject">Ders</FieldLabel>
              <select id="etut-subject" value={effectiveSubject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-1">
              <FieldLabel htmlFor="etut-teacher-select">Etüt öğretmenleri</FieldLabel>
              {isAdmin && onManageTeachers && (
                <button type="button" id="etut-manage-teachers" onClick={onManageTeachers} className="ml-auto text-xs font-semibold text-brand-fg hover:underline flex items-center gap-1 cursor-pointer">
                  <Settings2 className="w-3.5 h-3.5" />
                  Öğretmen listesini yönet
                </button>
              )}
            </div>
            <EtutTeacherSelect
              groups={teacherGroups}
              value={teacherIds}
              onChange={setTeacherIds}
              loading={teacherOptions === null}
              placeholder="Öğretmen seçin"
              currentSubject={effectiveSubject}
              allLabel={zumre.subjects.length > 1 ? `${zumre.name} zümresinin tüm öğretmenleri` : undefined}
            />
            <p className="text-[11px] text-muted mt-1">
              Kutucuklarla birden çok öğretmen seçebilirsiniz; seçilen her öğretmene etüt tanımlanır ve e-posta gider.
              {zumre.subjects.length > 1 && ` Listede ${zumre.name} zümresinin (${zumre.subjects.join(', ')}) bütün öğretmenleri var.`}
            </p>
          </div>
          {(() => {
            const noMail = selectedTeachers.filter((o) => !o.isMe && !o.hasEmail);
            return noMail.length ? (
              <p className="text-[11px] text-warning-fg" id="etut-teacher-nomail">
                {noMail.map((o) => o.name).join(', ')} için e-posta adresi kayıtlı değil; etüt kaydedilir ama {noMail.length > 1 ? 'bu öğretmenlere' : 'öğretmene'} e-posta gitmez.
                {isAdmin ? ' Öğretmen listesinden e-posta ekleyebilirsiniz.' : ' Yöneticiden eklemesini isteyin.'}
              </p>
            ) : null;
          })()}
        </FormSection>

        {/* 2. KONU */}
        <FormSection title="2. Konu">
          <div>
            <FieldLabel htmlFor="etut-topic">Etüt konusu / kazanım</FieldLabel>
            <input
              id="etut-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={160}
              placeholder="Örn: Üslü ifadeler – soru çözümü"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel htmlFor="etut-notes" optional>
              Öğrencilere not
            </FieldLabel>
            <input
              id="etut-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              placeholder="Örn: Soru bankanızı getirin"
              className={inputCls}
            />
          </div>
        </FormSection>

        {/* 3. ÖĞRENCİLER */}
        <FormSection title="3. Öğrenciler" hint="Sınıf yalnızca listeyi süzer; farklı sınıflardan öğrenci seçebilirsiniz">
          <StudentPicker
            variant="filter"
            idPrefix="etut"
            classes={classes}
            students={students}
            classIds={filterClassIds}
            onClassIdsChange={setFilterClassIds}
            selectedIds={selectedIds}
            onSelectedChange={setSelectedIds}
          />
        </FormSection>

        {/* 4. ZAMAN VE YER */}
        <FormSection title="4. Zaman ve yer" hint={isCopy && !date ? 'Kopya için yeni tarihi seçin' : undefined}>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chipCls(date === today)} onClick={() => setDate(today)}>
              Bugün
            </button>
            <button type="button" className={chipCls(date === tomorrow)} onClick={() => setDate(tomorrow)}>
              Yarın
            </button>
            {isCopy && sourceNextWeek && (
              <button type="button" id="etut-copy-next-week" className={chipCls(date === sourceNextWeek)} onClick={() => setDate(sourceNextWeek)}>
                Haftaya aynı gün ({shortTrDate(sourceNextWeek)})
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel htmlFor="etut-date">Tarih</FieldLabel>
              <input
                id="etut-date"
                type="date"
                min={isEdit ? undefined : today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={cx(inputCls, isCopy && !date && 'ring-2 ring-warning/40 border-warning')}
              />
            </div>
            <div>
              <FieldLabel htmlFor="etut-period" optional>
                Ders saati
              </FieldLabel>
              <select
                id="etut-period"
                value={lessonPeriod}
                onChange={(e) => {
                  const v = e.target.value;
                  setLessonPeriod(v);
                  if (v && periodTimes[v]) setTime(periodTimes[v]);
                }}
                className={inputCls}
              >
                <option value="">—</option>
                {LESSON_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                    {periodTimes[p] ? ` (${periodTimes[p]})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="etut-time" optional>
                Başlangıç
              </FieldLabel>
              <input id="etut-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel htmlFor="etut-duration" optional>
                Süre (dk)
              </FieldLabel>
              <input
                id="etut-duration"
                type="number"
                min={10}
                max={300}
                step={5}
                value={duration || ''}
                placeholder="40"
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted" id="etut-time-hint">
            Yalnızca tarih zorunlu. Saat, süre ve yer boş bırakılabilir (süre boşsa 40 dk sayılır).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d} type="button" className={chipCls(Number(duration) === d)} onClick={() => setDuration(d)}>
                {d} dk
              </button>
            ))}
            {endLabel && <span className="self-center text-[11px] text-muted ml-1">Bitiş: {endLabel}</span>}
          </div>
          <div>
            <FieldLabel htmlFor="etut-location" optional>
              Yer
            </FieldLabel>
            <input
              id="etut-location"
              list="etut-location-list"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={80}
              placeholder="Örn: Fen Laboratuvarı, 8-A sınıfı"
              className={inputCls}
            />
            <datalist id="etut-location-list">
              {locationSuggestions.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          {!isEdit && (
            <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Repeat className="w-4 h-4 text-info-fg" />
                <span className="text-xs font-semibold text-fg">Tekrar</span>
                <button type="button" id="etut-repeat-once" className={chipCls(repeatWeeks === 1)} onClick={() => setRepeatWeeks(1)}>
                  Tek seferlik
                </button>
                <button type="button" id="etut-repeat-weekly" className={chipCls(repeatWeeks > 1)} onClick={() => setRepeatWeeks((w) => (w > 1 ? w : 4))}>
                  Her hafta
                </button>
                {repeatWeeks > 1 && (
                  <label className="flex items-center gap-1.5 text-xs text-fg-2">
                    <select
                      id="etut-repeat-count"
                      value={repeatWeeks}
                      onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                      className="bg-surface border border-line rounded-lg px-2 py-1 text-xs"
                    >
                      {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    hafta
                  </label>
                )}
              </div>
              {repeatWeeks > 1 && (
                <p className="text-[11px] text-muted" id="etut-repeat-preview">
                  {occurrences.map(shortTrDate).join(' · ')}
                </p>
              )}
            </div>
          )}
        </FormSection>

        {editScheduled ? (
          <div id="etut-scheduled-note" className="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-[11px] text-muted">
            Bu etüt kopyalanarak tanımlandığı için e-posta etüt gününde otomatik gider. Değişiklik yapsanız bile ayrıca e-posta gönderilmez; gün geldiğinde güncel bilgiler gönderilir.
          </div>
        ) : (
          <MailOptIn
            id="etut-send-mail"
            checked={sendMail}
            onChange={setSendMail}
            label={
              isEdit
                ? 'Değişiklikleri etüt öğretmenine e-postayla bildir'
                : scheduledMail
                  ? 'Etüt gününde öğrencilere ve etüt öğretmenine otomatik e-posta gönder'
                  : 'Öğrencilere ve etüt öğretmenine e-posta gönder'
            }
            hint={
              isEdit
                ? 'Tarih, saat, yer, konu veya öğretmen değişirse yalnızca öğretmene bilgi gider. Öğretmen değişirse eski öğretmene de bildirilir.'
                : scheduledMail
                  ? 'Şimdi e-posta gitmez. Her etüt için, etüt gününde saat girilmişse etüt saatinden 1 saat önce, saat girilmemişse sabah 08:00\'de gider.'
                  : 'Etüt bugün olduğu için e-posta kaydedince hemen gider: öğrencilere etüt bilgisi, öğretmene etüt bilgisi ve öğrenci listesi.'
            }
          />
        )}

        {(errorText || conflicts) && (
          <div id="etut-form-alert">
            {errorText && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorText}</span>
              </div>
            )}
            {conflicts && (
              <div role="alert" id="etut-conflicts" className="p-3 rounded-xl bg-warning-soft text-warning-fg text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  Aynı saatte başka etüt var
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setConflicts(null)} className="ui-btn ui-btn-secondary ui-btn-sm">
                    Saati değiştireyim
                  </button>
                  <button type="button" id="etut-save-anyway" onClick={() => handleSubmit(true)} className="ui-btn ui-btn-warning ui-btn-sm">
                    Yine de kaydet
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {students.length === 0 && (
          <p className="text-xs text-muted flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            Size tanımlı öğrenci bulunmuyor.
          </p>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
};
