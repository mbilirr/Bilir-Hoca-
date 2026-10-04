import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Copy, Edit3, Save, AlertCircle, Clock, Info } from 'lucide-react';
import type { ClassGroup, Homework, HomeworkResource, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal } from '../ui/kit';
import { HomeworkResourceUploader } from './HomeworkResourceUploader';
import { removeStoredFiles, storedPathsOf } from '../../lib/fileStorage';
import { normalizeSubject, subjectsForBranch, subjectsForLevel } from '../../lib/subjects';
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
  TagInput,
} from './FormParts';

// ============================================================================
// Ödev oluştur / kopyala / düzenle penceresi (Aşama 9)
// Sıra: Sınıf ve öğrenciler → Ders → Başlık/açıklama/kazanım → Son teslim → Materyaller → E-posta
// ============================================================================

export type HomeworkFormMode = 'create' | 'copy' | 'edit';

export interface HomeworkFormSaved {
  homework: Homework;
  mode: HomeworkFormMode;
  sendMail: boolean;
}

interface Props {
  open: boolean;
  mode: HomeworkFormMode;
  source?: Homework | null; // kopyalanacak veya düzenlenecek ödev
  students: Student[];
  classes: ClassGroup[];
  onClose: () => void;
  onSaved: (r: HomeworkFormSaved) => void;
}

const QUICK_DUE: Array<{ label: string; days: number }> = [
  { label: 'Yarın', days: 1 },
  { label: '2 gün', days: 2 },
  { label: '3 gün', days: 3 },
  { label: '1 hafta', days: 7 },
  { label: '2 hafta', days: 14 },
];

// Kayıtlı son teslim metnini yerel tarih + saate ayırır ("2026-12-01T23:59" veya ISO/UTC)
function splitDue(due?: string): { date: string; time: string } {
  if (!due) return { date: '', time: '23:59' };
  const plain = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?$/.exec(due.trim());
  if (plain) return { date: plain[1], time: plain[2] || '23:59' };
  const d = new Date(due);
  if (isNaN(d.getTime())) return { date: '', time: '23:59' };
  return { date: localDateStr(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

const prefsKey = () => `edu_hw_form_prefs_${dataService.getCurrentTeacher()?.id || 'x'}`;
function readPrefs(): { classIds?: string[]; subject?: string } {
  try {
    return JSON.parse(localStorage.getItem(prefsKey()) || '{}') || {};
  } catch {
    return {};
  }
}
function writePrefs(p: { classIds: string[]; subject: string }) {
  try {
    localStorage.setItem(prefsKey(), JSON.stringify(p));
  } catch {}
}

const isCopyableResource = (r: HomeworkResource) =>
  typeof r?.url === 'string' && !r.url.startsWith('storage://') && !r.url.startsWith('data:');

export const HomeworkFormModal: React.FC<Props> = (props) =>
  props.open ? <HomeworkFormContent key={`${props.mode}-${props.source?.id || 'new'}`} {...props} /> : null;

const HomeworkFormContent: React.FC<Props> = ({ mode, source, students, classes, onClose, onSaved }) => {
  const me = dataService.getCurrentTeacher();
  const mySubjects = dataService.getMySubjects(); // null = yönetici (tüm dersler)
  const prefs = useMemo(readPrefs, []);
  const isEdit = mode === 'edit' && !!source;

  // ---- başlangıç değerleri
  const initial = useMemo(() => {
    const knownClass = (id: string) => classes.some((c) => c.id === id);
    let classIds: string[] = [];
    let selected: string[] = [];
    if (isEdit && source) {
      classIds = (source.targetClassIds && source.targetClassIds.length ? source.targetClassIds : source.classId && source.classId !== 'class-default' ? [source.classId] : []).filter(knownClass);
      const inClasses = students.filter((s) => classIds.includes(s.classId)).map((s) => s.id);
      selected = Array.isArray(source.assignedTo) && source.assignedTo.length ? source.assignedTo.filter((id) => inClasses.includes(id)) : inClasses;
    } else {
      // Yeni ödevde son kullanılan sınıf hatırlanır; kopyada sınıf bilerek yeniden seçilir
      const remembered = mode === 'copy' ? [] : (prefs.classIds || []).filter(knownClass);
      classIds = remembered.length ? remembered : classes.length === 1 ? [classes[0].id] : [];
      selected = students.filter((s) => classIds.includes(s.classId)).map((s) => s.id);
    }
    const due = isEdit ? splitDue(source!.dueDate) : { date: '', time: '23:59' };
    const subject = source ? normalizeSubject(source.subject) : '';
    return {
      classIds,
      selected,
      subject,
      title: source ? (mode === 'copy' ? source.title : source.title) : '',
      description: source?.description || '',
      outcomes: (source?.outcomes && source.outcomes.length ? source.outcomes : source?.learningOutcomes) || [],
      dueDate: due.date,
      dueTime: due.time,
      resources: source ? (isEdit ? source.resources || [] : (source.resources || []).filter(isCopyableResource)) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [classIds, setClassIds] = useState<string[]>(initial.classIds);
  const [selectedIds, setSelectedIds] = useState<string[]>(initial.selected);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [outcomes, setOutcomes] = useState<string[]>(initial.outcomes);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [dueTime, setDueTime] = useState(initial.dueTime);
  const [resources, setResources] = useState<HomeworkResource[]>(initial.resources);
  const [pendingResource, setPendingResource] = useState<HomeworkResource | null>(null);
  const [sendMail, setSendMail] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadBusy, setIsUploadBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draftId = useRef<string>(isEdit ? source!.id : dataService.newHomeworkId());
  useEffect(() => {
    if (errorText) document.getElementById('hw-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errorText]);

  // ---- ders seçenekleri: yönetici olmayan öğretmen yalnızca kendi branşı
  const level: 'Ortaokul' | 'Lise' | null = useMemo(() => {
    const levels = Array.from(new Set(classIds.map((id) => classLevel(classes.find((c) => c.id === id)))));
    return levels.length === 1 ? levels[0] : levels.length > 1 ? null : null;
  }, [classIds, classes]);
  const subjectOptions = useMemo(() => {
    const base = mySubjects ? mySubjects : subjectsForLevel(level);
    const list = [...base];
    if (initial.subject && !list.includes(initial.subject) && isEdit) list.push(initial.subject); // eski kayıt kaybolmasın
    return list;
  }, [mySubjects, level, initial.subject, isEdit]);
  const defaultSubject = () => {
    const candidates = [initial.subject, prefs.subject, ...subjectsForBranch(me?.branch)].filter(Boolean) as string[];
    return candidates.find((c) => subjectOptions.includes(c)) || subjectOptions[0] || '';
  };
  const [subject, setSubject] = useState<string>(defaultSubject);
  const effectiveSubject = subjectOptions.includes(subject) ? subject : subjectOptions[0] || '';

  // ---- değişiklik takibi
  const dirty =
    title !== initial.title ||
    description !== initial.description ||
    dueDate !== initial.dueDate ||
    dueTime !== initial.dueTime ||
    outcomes.join('|') !== initial.outcomes.join('|') ||
    classIds.join('|') !== initial.classIds.join('|') ||
    selectedIds.length !== initial.selected.length ||
    resources.length !== initial.resources.length ||
    !!pendingResource;

  const discardUploads = () => {
    const keep = new Set(storedPathsOf(source && isEdit ? source.resources : []));
    const unsaved = storedPathsOf(resources).filter((p) => !keep.has(p));
    if (unsaved.length) removeStoredFiles(unsaved);
  };
  const requestClose = () => {
    if (isSaving) return;
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    discardUploads();
    onClose();
  };

  const classStudents = students.filter((s) => classIds.includes(s.classId));
  const chosen = selectedIds.filter((id) => classStudents.some((s) => s.id === id));
  const todayStr = localDateStr(new Date());

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSaving) return;
    setErrorText(null);
    setConfirmDiscard(false);
    if (classIds.length === 0) return setErrorText('En az bir sınıf seçin.');
    if (classStudents.length > 0 && chosen.length === 0) return setErrorText('En az bir öğrenci seçin.');
    if (!effectiveSubject) return setErrorText('Ders seçin.');
    if (!title.trim()) return setErrorText('Ödev başlığını yazın.');
    if (!dueDate || !/^\d{2}:\d{2}$/.test(dueTime)) return setErrorText('Son teslim tarihini ve saatini seçin.');
    const dueStr = `${dueDate}T${dueTime}`;
    const dueMs = new Date(`${dueDate}T${dueTime}:00`).getTime();
    if (!isEdit && dueMs <= Date.now()) return setErrorText('Son teslim zamanı geçmiş bir an olamaz.');

    const everyone = chosen.length === classStudents.length;
    const assignedTo: 'all' | string[] = everyone ? 'all' : chosen;
    const finalResources = pendingResource ? [...resources, { ...pendingResource, id: `res-${Date.now()}` }] : resources;
    const levels = Array.from(new Set(classIds.map((id) => classLevel(classes.find((c) => c.id === id)))));
    const schoolLevel = levels.length === 1 ? levels[0] : undefined;

    setIsSaving(true);
    try {
      let saved: Homework;
      if (isEdit && source) {
        const updates: Partial<Homework> = {
          title: title.trim(),
          subject: effectiveSubject,
          schoolLevel: schoolLevel || source.schoolLevel,
          description: description.trim(),
          dueDate: dueStr,
          outcomes,
          learningOutcomes: outcomes,
          targetClassIds: classIds,
          assignedTo,
          resources: finalResources,
        };
        await dataService.updateHomework(source.id, updates);
        saved = { ...source, ...updates } as Homework;
      } else {
        saved = await dataService.createHomework({
          id: draftId.current,
          title: title.trim(),
          subject: effectiveSubject,
          schoolLevel,
          description: description.trim(),
          dueDate: dueStr,
          outcomes,
          learningOutcomes: outcomes,
          assignedTo,
          targetClassIds: classIds,
          resources: finalResources,
          createdByName: me?.name || 'Öğretmen',
          teacherId: me?.id,
        });
        writePrefs({ classIds, subject: effectiveSubject });
      }
      onSaved({ homework: saved, mode, sendMail: !isEdit && sendMail });
    } catch (err: any) {
      setErrorText(err?.message || 'Ödev kaydedilemedi. Lütfen tekrar deneyin.');
      setIsSaving(false);
    }
  };

  const heading = mode === 'edit' ? 'Ödevi Düzenle' : mode === 'copy' ? 'Ödevi Kopyala' : 'Yeni Ödev';
  const Icon = mode === 'edit' ? Edit3 : mode === 'copy' ? Copy : BookOpen;
  const droppedFiles = mode === 'copy' && source ? (source.resources || []).length - initial.resources.length : 0;
  const classLabel = classIds.map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(', ');

  return (
    <Modal
      open
      id="homework-form-modal"
      onClose={requestClose}
      icon={Icon}
      tone="success"
      size="lg"
      title={heading}
      description={isEdit ? source?.title : mode === 'copy' ? `"${source?.title}" ödevinden` : 'Sınıfı seçin, ödevi yazın, kaydedin'}
      footer={
        confirmDiscard ? (
          <DiscardBar
            onKeep={() => setConfirmDiscard(false)}
            onDiscard={() => {
              discardUploads();
              onClose();
            }}
          />
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted truncate max-w-full sm:max-w-[55%]" id="hw-form-summary">
              {classIds.length ? `${classLabel} · ${chosen.length} öğrenci` : 'Sınıf seçilmedi'}
              {dueDate ? ` · Son: ${shortTrDate(dueDate)} ${dueTime}` : ''}
            </span>
            <span className="flex gap-2 ml-auto">
              <button type="button" onClick={requestClose} className="ui-btn ui-btn-secondary">
                İptal
              </button>
              <button
                type="button"
                id="hw-form-save"
                onClick={() => handleSubmit()}
                disabled={isSaving || isUploadBusy}
                className="ui-btn ui-btn-primary"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Kaydediliyor…' : isUploadBusy ? 'Dosya yükleniyor…' : isEdit ? 'Değişiklikleri Kaydet' : 'Ödevi Kaydet'}
              </button>
            </span>
          </div>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormSection title="1. Sınıf ve öğrenciler" hint="Sınıf seçince tüm öğrencileri işaretlenir; istemediklerinizi kaldırın">
          <StudentPicker
            variant="classes"
            idPrefix="hw"
            classes={classes}
            students={students}
            classIds={classIds}
            onClassIdsChange={setClassIds}
            selectedIds={selectedIds}
            onSelectedChange={setSelectedIds}
          />
        </FormSection>

        <FormSection title="2. Ders" hint={mySubjects ? 'Branşınıza göre' : level ? level : undefined}>
          {subjectOptions.length <= 1 ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-line text-sm font-semibold text-fg" id="hw-subject-fixed">
              <BookOpen className="w-4 h-4 text-success-fg" />
              {effectiveSubject || 'Branş bilgisi yok'}
            </div>
          ) : (
            <select id="hw-subject" value={effectiveSubject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </FormSection>

        <FormSection title="3. Ödev">
          <div>
            <FieldLabel htmlFor="hw-title">Başlık</FieldLabel>
            <input
              id="hw-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Örn: Kesirlerle işlemler – Test 3"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel htmlFor="hw-desc" optional>
              Açıklama
            </FieldLabel>
            <textarea
              id="hw-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sayfa numaraları, teslim şekli, dikkat edilecekler…"
              className={`${inputCls} resize-y`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="hw-outcomes" optional>
              Kazanımlar
            </FieldLabel>
            <TagInput id="hw-outcomes" value={outcomes} onChange={setOutcomes} placeholder="Kazanımı yazıp Enter'a basın (örn: F.8.1.1)" />
          </div>
        </FormSection>

        <FormSection title="4. Son teslim">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_DUE.map((q) => {
              const d = localDateStr(addDays(new Date(), q.days));
              return (
                <button key={q.days} type="button" className={chipCls(dueDate === d)} onClick={() => setDueDate(d)}>
                  {q.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="hw-due-date">Tarih</FieldLabel>
              <input id="hw-due-date" type="date" min={isEdit ? undefined : todayStr} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <FieldLabel htmlFor="hw-due-time">Saat</FieldLabel>
              <input id="hw-due-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputCls} />
            </div>
          </div>
          {dueDate && (
            <p className="text-[11px] text-muted flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Son teslim: {shortTrDate(dueDate)}, {dueTime}
            </p>
          )}
        </FormSection>

        <FormSection title="5. Materyaller" hint="isteğe bağlı">
          {droppedFiles > 0 && (
            <p className="text-[11px] text-info-fg bg-info-soft rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Kopyada bağlantılar korunur; yüklenmiş {droppedFiles} dosya kopyalanmaz (gerekirse yeniden ekleyin).
            </p>
          )}
          <HomeworkResourceUploader
            resources={resources}
            onChange={setResources}
            onPendingChange={setPendingResource}
            storageFolder={`odev/${draftId.current}`}
            onBusyChange={setIsUploadBusy}
          />
          {pendingResource && (
            <p className="text-[11px] text-brand-fg">Yazdığınız bağlantı ("{pendingResource.title}") kaydederken eklenecek.</p>
          )}
        </FormSection>

        {!isEdit && (
          <MailOptIn
            id="hw-send-mail"
            checked={sendMail}
            onChange={setSendMail}
            label="Öğrencilere e-posta gönder"
            hint="Ödev kaydedilince seçilen öğrencilerin kayıtlı e-posta adreslerine bilgi gider."
          />
        )}

        {errorText && (
          <div role="alert" id="hw-form-error" className="flex items-start gap-2 p-3 rounded-xl bg-danger-soft text-danger-fg text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </div>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
};
