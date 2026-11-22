// Etütler: sayfanın bütün durumu ve işlemleri (Aşama 362). Görünüm parçaları bunu useEtutBaglam() ile okur.
import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { normalizeSubject } from '../../../lib/subjects';
import { usePagedList } from '../../../lib/listPaging';
import confetti from 'canvas-confetti';
import { Etut, Teacher } from '../../../types';
import { dataService } from '../../../services/dataService';
import { useHistoryState } from '../../../lib/useHistoryState';
import { type EtutFormSaved } from '../EtutFormModal';
import { callMail, describeMailResult, type MailResult } from '../../../lib/mailApi';
import { useQuickFocus } from '../../../lib/quickFocus';
import { isEtutEnded, hasEtutAttendance, etutExpectsAttendance } from '../../../lib/etutTiming';
import { NO_TEACHER_LABEL, etutTeacherNames } from '../../../lib/etutStatus';
import { useSeenIds } from '../../../lib/useSeenIds';
import { useBildirimKanali } from '../../../lib/bildirim';
import { HOME_SCOPE_KEY, DatePreset, NO_TIME, etutTimeKey, etutTimeLabel, presetBounds, EtutManagementProps, ATT_ETUT_KEY } from './ortak';

export function useEtutYonetimi({ etuts, students, classes }: EtutManagementProps) {
  const [viewMode, setViewMode] = useHistoryState<'calendar' | 'cards' | 'attendance' | 'takip'>('etut.view', 'calendar'); // Aşama 52: geri tuşu
  const [expandedEtutId, setExpandedEtutId] = useState<string | null>(null);
  const [viewEtut, setViewEtut] = useState<Etut | null>(null); // Aşama 111: salt okunur yoklama / yorum // Aşama 21: açık etüt şeridi
  // Aşama 179: yoklama ekranında seçili etüt sayfa yenilenince korunur (yalnız bu sekmede; etüt silindiyse ilk etüt)
  // Aşama 216: yoklama ekranı kapalı başlar; etüde dokununca satırın hemen altında açılır (akordeon)
  const [selectedAttendanceEtutId, setSelectedAttendanceEtutId] = useState<string>('');
  useEffect(() => {
    try {
      if (selectedAttendanceEtutId) sessionStorage.setItem(ATT_ETUT_KEY, selectedAttendanceEtutId);
    } catch {
      /* gizli sekme / depolama kapalı: seçim yalnız bu açılışta kalır */
    }
  }, [selectedAttendanceEtutId]);
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState<string>('');
  // Aşama 204: yoklama ekranında etüt seçimi kısa liste (süzgeç: null = yoklaması bekleyen varsa 'bekleyen', yoksa 'tumu')
  const [attPickFilter, setAttPickFilter] = useState<'bekleyen' | 'bugun' | 'tumu' | null>(null);
  const [attPickQuery, setAttPickQuery] = useState('');
  const [attPickLimit, setAttPickLimit] = useState(15); // Aşama 216: liste iç kaydırmasız, 15 satır + Daha fazla
  const setAttendanceFeedback = useBildirimKanali(); // Aşama 353: ortak bildirim
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({});
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isScheduleExportOpen, setIsScheduleExportOpen] = useState(false); // Aşama 27: etüt listesi (Excel/PDF)
  const [reportSelectedStudentId, setReportSelectedStudentId] = useState<string | undefined>(undefined);

  // Ana sayfa kısayolu: yeni etüt penceresini aç
  // Aşama 98: Kurum Özeti'nden gelen öğretmen süzgeci (etüt öğretmeni adına göre)
  useQuickFocus(['action', 'teacher'], (f) => {
    if (f.type === 'teacher') {
      setListSubject('all');
      setListTeacher(f.label);
      return;
    }
    if (f.id === 'etut-create' && dataService.canPlanEtut()) {
      openEtutForm('create');
    }
    // Aşama 249: rehberlik ana sayfası › öğrenci › "Etüt ver": öğrenci(ler) seçili yeni etüt (label = öğrenci kimlikleri, virgülle)
    if (f.id === 'etut-create-ogrenci' && dataService.canPlanEtut()) {
      openEtutForm('create', null, null, f.label.split(',').filter(Boolean));
    }
  });
  const [etutToDelete, setEtutToDelete] = useState<Etut | null>(null);
  const [selectedEtutForDispatch, setSelectedEtutForDispatch] = useState<Etut | null>(null);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedEtutForAttendance, setSelectedEtutForAttendance] = useState<Etut | null>(null);

  // Mobil veya bilgisayardan açıldığında en son etütleri anında buluttan senkronize et
  useEffect(() => {
    dataService.syncEtutsFromSupabase(true);
  }, []);

  const session = dataService.getAuthSession();
  const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;

  // Aşama 111: "Tüm Okul" genel yönetici, idare ve Rehberlik'te; Zümre Başkanı "Benim / Zümrem" seçer.
  // Diğer öğretmenler yalnız kendi kaydettiği ve kendisine verilen etütleri görür. Liste (etuts) zaten
  // dataService.getVisibleEtuts(): ana sayfa, zil ve bu sayfa aynı kuralla süzülür.
  const isAdminView = dataService.seesAllEtuts();
  const isZumreView = !isAdminView && dataService.hasRole('zumre_baskani');
  const wideView = isAdminView || isZumreView;
  // Ana sayfadaki "Benim / Tümü" seçimiyle aynı kayıt: ana sayfada görülen sayı burada da aynen görünür
  const [scopeFilter, setScopeState] = useState<'all' | 'mine'>(() => {
    const fallback = dataService.showsKurumOzeti() ? 'all' : 'mine';
    try {
      const v = window.localStorage.getItem(HOME_SCOPE_KEY);
      return v === 'mine' || v === 'all' ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const setScopeFilter = (v: 'all' | 'mine') => {
    setScopeState(v);
    try {
      window.localStorage.setItem(HOME_SCOPE_KEY, v);
    } catch {
      /* depolama kapalı */
    }
  };
  const scope: 'all' | 'mine' = wideView ? scopeFilter : 'mine';
  const canEditEtut = useCallback((e: Etut) => dataService.canEditEtutPublic(e), []);
  // Takip görünümü yalnız idare / Rehberlik'te; kayıtlı geçmiş başka hesapta açılırsa takvime döner
  useEffect(() => {
    if (viewMode === 'takip' && !isAdminView) setViewMode('calendar', { replace: true });
  }, [viewMode, isAdminView, setViewMode]);

  const myEtuts = useMemo(() => (currentTeacher ? etuts.filter((e) => dataService.isMyEtut(e)) : etuts), [etuts, currentTeacher]);

  const activeEtuts = scope === 'mine' ? myEtuts : etuts;

  // Aşama 24: tüm görünümler için ders süzgeci (açılır liste) ve tarih süzgeci (hazır seçim + aralık)
  const [listSubject, setListSubject] = useState<string>('all');
  const listSubjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of activeEtuts) {
      const s = normalizeSubject(e.subject) || 'Belirtilmemiş';
      m.set(s, (m.get(s) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [activeEtuts]);
  const effectiveListSubject = listSubject !== 'all' && listSubjects.some(([s]) => s === listSubject) ? listSubject : 'all';
  // Aşama 28: öğretmen süzgeci (açılır liste). Çoklu öğretmenli etütte her öğretmen ayrı sayılır.
  // Aşama 33: bir ders seçiliyse öğretmen listesinde yalnızca O DERSİN etütlerini veren öğretmenler (ve o dersteki etüt sayıları) görünür.
  const [listTeacher, setListTeacher] = useState<string>('all');
  const subjectScopedEtuts = useMemo(
    () =>
      effectiveListSubject === 'all'
        ? activeEtuts
        : activeEtuts.filter((e) => (normalizeSubject(e.subject) || 'Belirtilmemiş') === effectiveListSubject),
    [activeEtuts, effectiveListSubject]
  );
  const listTeachers = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of subjectScopedEtuts) {
      const names = etutTeacherNames(e);
      for (const n of names.length ? names : [NO_TEACHER_LABEL]) m.set(n, (m.get(n) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [subjectScopedEtuts]);
  const effectiveListTeacher = listTeacher !== 'all' && listTeachers.some(([t]) => t === listTeacher) ? listTeacher : 'all';
  // Aşama 32: biten ama yoklaması alınmamış etütler öğretmen başına (Yoklama görünümünde öğretmen listesinde yanıp söner)
  const missingEtutIdsByTeacher = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of subjectScopedEtuts) {
      if (!(isEtutEnded(e) && etutExpectsAttendance(e) && !hasEtutAttendance(e))) continue;
      const names = etutTeacherNames(e);
      for (const n of names.length ? names : [NO_TEACHER_LABEL]) m.set(n, [...(m.get(n) || []), e.id]);
    }
    return m;
  }, [subjectScopedEtuts]);
  const missingAttendanceByTeacher = useMemo(
    () => new Map(Array.from(missingEtutIdsByTeacher.entries()).map(([n, ids]) => [n, ids.length] as [string, number])),
    [missingEtutIdsByTeacher]
  );
  // Aşama 33d: yanıp sönen öğretmene (ya da yoklaması eksik etüde) tıklanınca o etütler "görüldü" sayılır ve yanıp sönme durur.
  // "N yoklama eksik" yazısı yoklama alınana kadar sabit kırmızı kalır. Yeni bir etüdün yoklaması eksik kalırsa yeniden yanıp söner.
  // "Görüldü" bilgisi bu tarayıcıda tutulur.
  const [ackMissingIds, ackMissing] = useSeenIds(`etut_missatt_ack_${currentTeacher?.id || 'x'}`);
  const blinkingTeachers = useMemo(() => {
    const set = new Set<string>();
    missingEtutIdsByTeacher.forEach((ids, n) => {
      if (ids.some((id) => !ackMissingIds.has(id))) set.add(n);
    });
    return set;
  }, [missingEtutIdsByTeacher, ackMissingIds]);
  const subjectEtuts = useMemo(
    () =>
      activeEtuts.filter((e) => {
        if (effectiveListSubject !== 'all' && (normalizeSubject(e.subject) || 'Belirtilmemiş') !== effectiveListSubject) return false;
        if (effectiveListTeacher !== 'all') {
          const names = etutTeacherNames(e);
          if (!(names.length ? names : [NO_TEACHER_LABEL]).includes(effectiveListTeacher)) return false;
        }
        return true;
      }),
    [activeEtuts, effectiveListSubject, effectiveListTeacher]
  );
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const dateBounds = useMemo(() => presetBounds(datePreset, rangeFrom, rangeTo), [datePreset, rangeFrom, rangeTo]);
  const listEtuts = useMemo(() => {
    const [from, to] = dateBounds;
    if (!from && !to) return subjectEtuts;
    return subjectEtuts.filter((e) => {
      const d = String(e.date || '').slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    });
  }, [subjectEtuts, dateBounds]);
  // Aşama 30/31: Liste ve Haftalık Takvim görünümlerinde ders saati süzgeci (açılır liste). Seçenekler, diğer
  // süzgeçlerden geçen etütlerin saatlerinden oluşur (ör. "15:00 – 15:45 (4)"); saat girilmemiş etütler ayrı seçenektir.
  // Takvimde tarih süzgeci olmadığı için seçenekler ders/öğretmen süzgecinden geçen tüm etütlerden gelir.
  const [listTime, setListTime] = useState<string>('all');
  const timeFilterOn = viewMode === 'cards' || viewMode === 'calendar';
  const timeSource = viewMode === 'calendar' ? subjectEtuts : listEtuts;
  const listTimes = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const e of timeSource) {
      const key = etutTimeKey(e);
      const cur = m.get(key);
      if (cur) cur.count += 1;
      else m.set(key, { label: etutTimeLabel(e), count: 1 });
    }
    // Saate göre sıralı; "saat belirtilmemiş" en sonda
    return Array.from(m.entries()).sort((a, b) => (a[0] === NO_TIME ? 1 : b[0] === NO_TIME ? -1 : a[0].localeCompare(b[0])));
  }, [timeSource]);
  const effectiveListTime = timeFilterOn && listTime !== 'all' && listTimes.some(([k]) => k === listTime) ? listTime : 'all';
  const cardEtuts = useMemo(
    () => (effectiveListTime === 'all' ? listEtuts : listEtuts.filter((e) => etutTimeKey(e) === effectiveListTime)),
    [listEtuts, effectiveListTime]
  );
  const calendarEtuts = useMemo(
    () => (effectiveListTime === 'all' ? subjectEtuts : subjectEtuts.filter((e) => etutTimeKey(e) === effectiveListTime)),
    [subjectEtuts, effectiveListTime]
  );
  const filtersOn =
    effectiveListSubject !== 'all' ||
    effectiveListTeacher !== 'all' ||
    effectiveListTime !== 'all' ||
    (viewMode !== 'calendar' && datePreset !== 'all');
  const clearFilters = () => {
    setListSubject('all');
    setListTeacher('all');
    setListTime('all');
    setDatePreset('all');
    setRangeFrom('');
    setRangeTo('');
  };
  const pagedListEtuts = usePagedList(cardEtuts, `${effectiveListSubject}|${effectiveListTeacher}|${effectiveListTime}|${scope}|${dateBounds.join('~')}`, 30);

  // Etüt oluştur / düzenle penceresi (Aşama 9)
  const [etutForm, setEtutForm] = useState<{ mode: 'create' | 'edit' | 'copy'; source: Etut | null; initialDate: string | null; ogrenciler?: string[] } | null>(null);
  const openEtutForm = (mode: 'create' | 'edit' | 'copy', source: Etut | null = null, initialDate: string | null = null, ogrenciler?: string[]) => {
    if (mode !== 'edit' && !dataService.canPlanEtut()) return; // Aşama 98
    setEtutForm({ mode, source, initialDate, ogrenciler });
  };
  const openEdit = (etut: Etut) => openEtutForm('edit', etut);
  const openCopy = (etut: Etut) => openEtutForm('copy', etut);
  const handleAddEtutForDate = (dateStr: string) => openEtutForm('create', null, dateStr);
  const [isTeacherManagerOpen, setIsTeacherManagerOpen] = useState(false);
  const [teacherListVersion, setTeacherListVersion] = useState(0);
  const setMailNotice = useBildirimKanali(); // Aşama 353: ortak bildirim

  const handleEtutSaved = async (r: EtutFormSaved) => {
    setEtutForm(null);
    if (r.mode !== 'edit') confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    // Aşama 353: yeni etütte bildirimde "WhatsApp ile de bildir" eylemi (eski şeritteki bağlantı)
    const ilk = r.mode !== 'edit' ? r.etuts[0] : undefined;
    const whatsapp = ilk
      ? {
          ad: 'WhatsApp ile de bildir',
          calistir: () => {
            setSelectedEtutForDispatch(ilk);
            setIsDispatchModalOpen(true);
          },
        }
      : undefined;
    const base =
      r.mode !== 'edit'
        ? r.etuts.length > 1
          ? `${r.etuts.length} etüt kaydedildi.${r.failedCount ? ` ${r.failedCount} etüt kaydedilemedi.` : ''}`
          : r.mode === 'copy'
            ? 'Etüdün kopyası kaydedildi.'
            : 'Etüt kaydedildi.'
        : 'Etüt güncellendi.';
    if (!r.sendMail) {
      const extra = r.mailScheduled ? ' E-postalar etüt gününde otomatik gönderilecek (saat girilmişse 1 saat önce, değilse sabah 08:00).' : '';
      setMailNotice({ tone: r.failedCount ? 'warning' : 'success', text: `${base}${extra}` }, whatsapp);
      return;
    }
    setMailNotice({ tone: 'info', text: `${base} E-postalar gönderiliyor…` }, whatsapp);
    let total: MailResult | null = null;
    for (const e of r.etuts) {
      const res =
        r.mode !== 'edit'
          ? await callMail('etut-created', { etutId: e.id })
          : await callMail('etut-changed', { etutId: e.id, changes: r.changes || [], previousTeacherId: r.previousTeacherId || null, previousTeacherIds: r.previousTeacherIds || null });
      if (!total) total = res;
      else {
        const prev: MailResult = total;
        total = {
          ...prev,
          ok: prev.ok && res.ok,
          sent: (prev.sent || 0) + (res.sent || 0),
          failed: (prev.failed || 0) + (res.failed || 0),
          skipped: (prev.skipped || 0) + (res.skipped || 0),
          errors: [...(prev.errors || []), ...(res.errors || [])].slice(0, 3),
        };
      }
      if (!res.ok || res.notConfigured || res.authError) break;
    }
    const d = describeMailResult(total);
    setMailNotice({ tone: d.tone, text: `${base} ${d.text}` }, whatsapp);
  };

  const handleConfirmDeleteEtut = async () => {
    const etut = etutToDelete;
    if (!etut) return;
    setEtutToDelete(null);
    let mailText = '';
    // Aşama 24: iptal e-postası yalnızca etüt başlamadan önce ya da etüt sürerken gider.
    // Saati geçmiş (bitmiş) bir etüt silinirse öğretmene iptal e-postası gönderilmez.
    if (!isEtutEnded(etut) && etut.teacherId) {
      const res = await callMail('etut-cancelled', { etutId: etut.id });
      if (res.ok && res.sent) mailText = res.sent > 1 ? ` Etüt öğretmenlerine (${res.sent}) iptal e-postası gönderildi.` : ' Etüt öğretmenine iptal e-postası gönderildi.';
      else if (res.ok && res.teachers && res.teachers[0]?.status === 'no-email') mailText = ' Etüt öğretmeninin e-postası kayıtlı olmadığı için bildirim gitmedi.';
      else if (!res.ok || res.failed || res.notConfigured) mailText = ` ${describeMailResult(res).text}`;
    }
    try {
      await dataService.deleteEtut(etut.id);
      setMailNotice({ tone: mailText.includes('gönderilemedi') ? 'warning' : 'success', text: `Etüt silindi.${mailText}` });
    } catch (err: any) {
      setMailNotice({ tone: 'danger', text: (err?.message || 'Etüt silinemedi.').replace(/^\[\w+\]\s*/, '') });
    }
  };

  return {
    etuts,
    students,
    classes,
    viewMode,
    setViewMode,
    expandedEtutId,
    setExpandedEtutId,
    viewEtut,
    setViewEtut,
    selectedAttendanceEtutId,
    setSelectedAttendanceEtutId,
    attendanceSearchQuery,
    setAttendanceSearchQuery,
    attPickFilter,
    setAttPickFilter,
    attPickQuery,
    setAttPickQuery,
    attPickLimit,
    setAttPickLimit,
    setAttendanceFeedback,
    attendanceNotes,
    setAttendanceNotes,
    isSentCommunicationsOpen,
    setIsSentCommunicationsOpen,
    isReportModalOpen,
    setIsReportModalOpen,
    isScheduleExportOpen,
    setIsScheduleExportOpen,
    reportSelectedStudentId,
    setReportSelectedStudentId,
    etutToDelete,
    setEtutToDelete,
    selectedEtutForDispatch,
    setSelectedEtutForDispatch,
    isDispatchModalOpen,
    setIsDispatchModalOpen,
    selectedEtutForAttendance,
    setSelectedEtutForAttendance,
    session,
    currentTeacher,
    isAdminView,
    isZumreView,
    wideView,
    scopeFilter,
    setScopeState,
    setScopeFilter,
    scope,
    canEditEtut,
    myEtuts,
    activeEtuts,
    listSubject,
    setListSubject,
    listSubjects,
    effectiveListSubject,
    listTeacher,
    setListTeacher,
    subjectScopedEtuts,
    listTeachers,
    effectiveListTeacher,
    missingEtutIdsByTeacher,
    missingAttendanceByTeacher,
    ackMissingIds,
    ackMissing,
    blinkingTeachers,
    subjectEtuts,
    datePreset,
    setDatePreset,
    rangeFrom,
    setRangeFrom,
    rangeTo,
    setRangeTo,
    dateBounds,
    listEtuts,
    listTime,
    setListTime,
    timeFilterOn,
    timeSource,
    listTimes,
    effectiveListTime,
    cardEtuts,
    calendarEtuts,
    filtersOn,
    clearFilters,
    pagedListEtuts,
    etutForm,
    setEtutForm,
    openEtutForm,
    openEdit,
    openCopy,
    handleAddEtutForDate,
    isTeacherManagerOpen,
    setIsTeacherManagerOpen,
    teacherListVersion,
    setTeacherListVersion,
    setMailNotice,
    handleEtutSaved,
    handleConfirmDeleteEtut,
  };
}

export type EtutBaglamDegeri = ReturnType<typeof useEtutYonetimi>;
export const EtutBaglam = createContext<EtutBaglamDegeri | null>(null);
export function useEtutBaglam(): EtutBaglamDegeri {
  const d = useContext(EtutBaglam);
  if (!d) throw new Error('EtutBaglam sağlayıcısı yok');
  return d;
}
