import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { ExpandableStrip, StripAction } from '../ui/ExpandableStrip';
import { normalizeSubject } from '../../lib/subjects';
import { usePagedList, ShowMoreBar } from '../../lib/listPaging';
import {
  CalendarDays,
  LayoutGrid,
  Plus,
  Clock,
  MapPin,
  Users,
  CalendarCheck,
  Trash2,
  Edit2,
  X,
  Sparkles,
  CheckCircle2,
  BookOpen,
  Save,
  Mail,
  School,
  GraduationCap,
  Filter,
  BarChart3,
  ListChecks,
  Layers,
  FileText,
  MessageCircle,
  UserPlus,
  Check,
  Search,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
  MessageSquareQuote,
  ChevronDown,
  Copy,
  Lock,
  Eye,
  ClipboardList,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Etut, Student, ClassGroup, Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { useHistoryState } from '../../lib/useHistoryState';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { WeeklyEtutCalendar } from './WeeklyEtutCalendar';
import { SentCommunicationsModal } from './SentCommunicationsModal';
import { EtutAnalysisReportModal } from './EtutAnalysisReportModal';
import { EtutNotificationModal } from './EtutNotificationModal';
import { EtutAttendanceModal } from './EtutAttendanceModal';
import { EtutFormModal, type EtutFormSaved } from './EtutFormModal';
import { EtutTeacherManagerModal } from './EtutTeacherManagerModal';
import { MailNoticeBar } from './FormParts';
import { callMail, describeMailResult, type MailResult } from '../../lib/mailApi';
import { useQuickFocus } from '../../lib/quickFocus';
import { PageHeader, Segmented } from '../ui/kit';
import { isEtutEnded, hasEtutAttendance, etutExpectsAttendance } from '../../lib/etutTiming';
import { EtutScheduleExportModal } from './EtutScheduleExportModal';
import { ETUT_STATUS_STYLE, NO_TEACHER_LABEL, etutTeacherNames, getEtutStatus } from '../../lib/etutStatus';
import { EtutStatusLegend } from './EtutStatusLegend';
import { lazyNamed } from '../../lib/lazyLoad';

// Aşama 111: TeacherHome ile ortak kapsam kaydı (Benim / Tümü)
const HOME_SCOPE_KEY = 'edu_home_scope_v1';
// Aşama 111: Takip görünümü ve salt okunur ayrıntı penceresi ayrı parça (yalnız idare / Rehberlik açınca iner)
const EtutTakipView = lazyNamed(() => import('./EtutTakipView'), 'EtutTakipView');
const EtutDetayModal = lazyNamed(() => import('./EtutTakipView'), 'EtutDetayModal');
// Aşama 115: branş etüt listesi (Excel) — yalnız açılınca iner
const EtutBransListesiModal = lazyNamed(() => import('./EtutBransListesiModal'), 'EtutBransListesiModal');
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import { useSeenIds } from '../../lib/useSeenIds';

// Aşama 24: tarih süzgeci
type DatePreset = 'all' | 'today' | 'week' | 'month' | 'upcoming' | 'past' | 'range';
const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
  { value: 'upcoming', label: 'Gelecek' },
  { value: 'past', label: 'Geçmiş' },
  { value: 'range', label: 'Tarih aralığı' },
];
// Aşama 30: ders saati süzgeci için yardımcılar
const NO_TIME = 'none';
/** Etüdün başlangıç saati anahtarı ("09:05" biçiminde); saat yoksa NO_TIME */
function etutTimeKey(e: Etut): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((e.time || '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : NO_TIME;
}
/** Açılır listede görünen yazı: "15:00 – 15:45" (süre yoksa yalnız başlangıç) */
function etutTimeLabel(e: Etut): string {
  const key = etutTimeKey(e);
  if (key === NO_TIME) return 'Saat belirtilmemiş';
  const dur = Number(e.duration) || 0;
  if (dur <= 0) return key;
  const [h, m] = key.split(':').map(Number);
  const end = h * 60 + m + dur;
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${key} – ${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function presetBounds(p: DatePreset, from: string, to: string): [string, string] {
  const now = new Date();
  const today = ymdLocal(now);
  if (p === 'today') return [today, today];
  if (p === 'week') {
    const m = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const s = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 6);
    return [ymdLocal(m), ymdLocal(s)];
  }
  if (p === 'month') return [ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1)), ymdLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  if (p === 'upcoming') return [today, ''];
  if (p === 'past') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return ['', ymdLocal(y)];
  }
  if (p === 'range') return from && to && from > to ? [to, from] : [from, to];
  return ['', ''];
}

interface EtutManagementProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
}

export const EtutManagement: React.FC<EtutManagementProps> = ({ etuts, students, classes }) => {
  const [viewMode, setViewMode] = useHistoryState<'calendar' | 'cards' | 'attendance' | 'takip'>('etut.view', 'calendar'); // Aşama 52: geri tuşu
  const [expandedEtutId, setExpandedEtutId] = useState<string | null>(null);
  const [viewEtut, setViewEtut] = useState<Etut | null>(null); // Aşama 111: salt okunur yoklama / yorum // Aşama 21: açık etüt şeridi
  const [selectedAttendanceEtutId, setSelectedAttendanceEtutId] = useState<string>(etuts[0]?.id || '');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState<string>('');
  const [attendanceFeedback, setAttendanceFeedback] = useState<string | null>(null);
  useAutoDismiss(attendanceFeedback, () => setAttendanceFeedback(null)); // Aşama 32: 15 sn sonra kaybolur
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({});
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isScheduleExportOpen, setIsScheduleExportOpen] = useState(false); // Aşama 27: etüt listesi (Excel/PDF)
  const [isBransListOpen, setIsBransListOpen] = useState(false); // Aşama 115: branş etüt listesi (Excel)
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
  const [etutForm, setEtutForm] = useState<{ mode: 'create' | 'edit' | 'copy'; source: Etut | null; initialDate: string | null } | null>(null);
  const openEtutForm = (mode: 'create' | 'edit' | 'copy', source: Etut | null = null, initialDate: string | null = null) => {
    if (mode !== 'edit' && !dataService.canPlanEtut()) return; // Aşama 98
    setEtutForm({ mode, source, initialDate });
  };
  const openEdit = (etut: Etut) => openEtutForm('edit', etut);
  const openCopy = (etut: Etut) => openEtutForm('copy', etut);
  const handleAddEtutForDate = (dateStr: string) => openEtutForm('create', null, dateStr);
  const [isTeacherManagerOpen, setIsTeacherManagerOpen] = useState(false);
  const [teacherListVersion, setTeacherListVersion] = useState(0);
  const [mailNotice, setMailNotice] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null>(null);
  useAutoDismiss(mailNotice, () => setMailNotice(null)); // Aşama 32: 15 sn sonra kaybolur
  const [lastCreatedEtut, setLastCreatedEtut] = useState<Etut | null>(null);

  const handleEtutSaved = async (r: EtutFormSaved) => {
    setEtutForm(null);
    if (r.mode !== 'edit') {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
      setLastCreatedEtut(r.etuts[0] || null);
    }
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
      setMailNotice({ tone: r.failedCount ? 'warning' : 'success', text: `${base}${extra}` });
      return;
    }
    setMailNotice({ tone: 'info', text: `${base} E-postalar gönderiliyor…` });
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
    setMailNotice({ tone: d.tone, text: `${base} ${d.text}` });
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

  return (
    <div className="space-y-6">
      {/* Sayfa başlığı */}
      <PageHeader
        icon={CalendarDays}
        tone="info"
        title="Etütler"
        description="Etüt ve birebir çalışma planı, yoklama ve analiz"
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsScheduleExportOpen(true)}
              id="btn-etut-schedule-export"
              className="ui-btn ui-btn-secondary"
              title="Sınıfa göre günlük / haftalık etüt listesini Excel veya PDF olarak indir"
            >
              <ListChecks className="w-4 h-4" />
              <span>Etüt Listesi</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBransListOpen(true)}
              id="btn-etut-brans-list"
              className="ui-btn ui-btn-secondary"
              title="Öğrencilerin ders ders etüt listesi (sınıf sınıf / toplu, konu ve kazanıma göre) Excel olarak"
            >
              <Layers className="w-4 h-4" />
              <span>Branş Listesi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReportSelectedStudentId(undefined);
                setIsReportModalOpen(true);
              }}
              id="btn-etut-analysis"
              className="ui-btn ui-btn-secondary"
              title="Sınıf ve öğrenci bazlı etüt analizi ve raporu"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Etüt Analizi</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSentCommunicationsOpen(true)}
              className="ui-btn ui-btn-secondary ui-btn-icon"
              title="Giden e-posta ve bildirimler"
              aria-label="Giden e-posta ve bildirimler"
            >
              <Mail className="w-4 h-4" />
            </button>
            {dataService.canPlanEtut() && (
              <button
                type="button"
                id="btn-create-etut"
                onClick={() => {
                  openEtutForm('create');
                }}
                className="ui-btn ui-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Etüt Planla</span>
              </button>
            )}
          </>
        }
      />
      {mailNotice && (
        <MailNoticeBar
          notice={mailNotice}
          onClose={() => {
            setMailNotice(null);
            setLastCreatedEtut(null);
          }}
          action={
            lastCreatedEtut ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedEtutForDispatch(lastCreatedEtut);
                  setIsDispatchModalOpen(true);
                }}
                className="shrink-0 underline underline-offset-2 hover:no-underline cursor-pointer"
              >
                WhatsApp ile de bildir
              </button>
            ) : undefined
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {viewMode === 'takip' && isAdminView ? (
          /* Aşama 111: Takip her zaman kurumun tamamını gösterir (Benim / Tümü seçimi burada geçerli değil) */
          <span className="ui-chip ui-chip-neutral" id="etut-scope-takip" title="Takip görünümü kurumun bütün etütlerini gösterir">
            Tüm Okul ({etuts.length})
          </span>
        ) : wideView ? (
          <Segmented
            value={scopeFilter}
            onChange={(v) => setScopeFilter(v)}
            items={[
              { value: 'all', label: `${isAdminView ? 'Tüm Okul' : 'Zümrem'} (${etuts.length})`, id: 'etut-scope-all' },
              { value: 'mine', label: `Benim Etütlerim (${myEtuts.length})`, id: 'etut-scope-mine' },
            ]}
          />
        ) : (
          <span className="ui-chip ui-chip-neutral" id="etut-scope-mine-only" title="Oluşturduğunuz ve etüt öğretmeni olarak atandığınız etütler">
            Etütlerim ({myEtuts.length})
          </span>
        )}
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v)}
          items={[
            { value: 'calendar', label: 'Haftalık Takvim', icon: CalendarDays },
            { value: 'cards', label: `Liste (${activeEtuts.length})`, icon: LayoutGrid },
            { value: 'attendance', label: 'Yoklama', icon: CalendarCheck },
            ...(isAdminView ? [{ value: 'takip' as const, label: 'Takip', icon: ClipboardList, id: 'etut-view-takip' }] : []),
          ]}
        />
      </div>

      {/* Süzgeç çubuğu: Ders + Öğretmen açılır listeleri (Aşama 28) her görünümde; tarih süzgeci yalnız Liste ve Yoklama'da.
          Haftalık Takvim'in kendi hafta okları olduğu için orada tarih süzgeci gösterilmez. */}
      {viewMode === 'takip' && isAdminView && (
        <Suspense fallback={<div className="ui-card p-8 text-center text-sm text-muted">Yükleniyor…</div>}>
          <EtutTakipView etuts={etuts} students={students} classes={classes} onOpenEtut={setViewEtut} />
        </Suspense>
      )}

      {viewMode !== 'takip' && (
      <div className="ui-card p-3 sm:p-4 space-y-3" id="etut-filter-bar">
        {/* Aşama 33: Ders, Öğretmen, Ders saati ve Tarih aynı yükseklikte, aynı sırada, simetrik ızgarada.
            Aşama 33b: geniş ekranda kutular sayfayı doldurmaz; hepsi EŞİT genişlikte ve bu genişlik EN UZUN yazı kadardır
            (width: max-content + eşit 1fr sütunlar: her sütun en geniş içeriğe göre ölçülür; sığmazsa eşit küçülür). Telefon/tablette tam genişlik. */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end w-full lg:w-max lg:max-w-full lg:grid-cols-none lg:grid-flow-col lg:[grid-auto-columns:1fr]"
          id="etut-filter-grid"
        >
          <div className="min-w-0">
            <label htmlFor="etut-list-subject" className="block text-xs font-semibold text-muted mb-1">
              Ders
            </label>
            <select
              id="etut-list-subject"
              value={effectiveListSubject}
              onChange={(e) => setListSubject(e.target.value)}
              className="w-full h-10 bg-surface border border-line rounded-xl px-3 text-sm text-fg focus:outline-none focus:border-brand"
            >
              <option value="all">Tüm dersler ({activeEtuts.length})</option>
              {listSubjects.map(([s, n]) => (
                <option key={s} value={s}>
                  {s} ({n})
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <span id="etut-list-teacher-label" className="block text-xs font-semibold text-muted mb-1">
              Öğretmen
            </span>
            {/* Aşama 32: düz <select> yanıp sönemediği için özel açılır liste. Yoklama görünümünde yoklama almayan
                öğretmenler kırmızı yan-sön ile ve "N yoklama eksik" yazısıyla gösterilir. */}
            <TeacherPicker
              value={effectiveListTeacher}
              onChange={setListTeacher}
              allLabel={
                effectiveListSubject === 'all'
                  ? `Tüm öğretmenler (${activeEtuts.length})`
                  : `${effectiveListSubject} öğretmenleri (${subjectScopedEtuts.length})`
              }
              options={listTeachers}
              missing={missingAttendanceByTeacher}
              blinking={blinkingTeachers}
              onAcknowledge={(t) => ackMissing(missingEtutIdsByTeacher.get(t) || [])}
              blink={viewMode === 'attendance'}
            />
          </div>
          {timeFilterOn && (
            <div className={`min-w-0 ${viewMode === 'calendar' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
              <label htmlFor="etut-list-time" className="block text-xs font-semibold text-muted mb-1">
                Ders saati
              </label>
              <select
                id="etut-list-time"
                value={effectiveListTime}
                onChange={(e) => setListTime(e.target.value)}
                className="w-full h-10 bg-surface border border-line rounded-xl px-3 text-sm text-fg focus:outline-none focus:border-brand"
              >
                <option value="all">Tüm saatler ({timeSource.length})</option>
                {listTimes.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label} ({v.count})
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Aşama 33c: Tarih süzgeci de aynı sırada, aynı biçimde (açılır liste). Haftalık Takvim'in kendi hafta okları var. */}
          {viewMode !== 'calendar' && (
            <div className="min-w-0">
              <label htmlFor="etut-list-date" className="block text-xs font-semibold text-muted mb-1">
                Tarih
              </label>
              <select
                id="etut-list-date"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="w-full h-10 bg-surface border border-line rounded-xl px-3 text-sm text-fg focus:outline-none focus:border-brand"
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {viewMode !== 'calendar' && datePreset === 'range' && (
          <div className="flex flex-wrap items-end gap-2" id="etut-date-range-fields">
            <label className="text-xs text-muted">
              <span className="block font-semibold mb-1">Başlangıç</span>
              <input type="date" id="etut-date-from" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="bg-surface border border-line rounded-xl px-3 py-1.5 text-sm text-fg" />
            </label>
            <label className="text-xs text-muted">
              <span className="block font-semibold mb-1">Bitiş</span>
              <input type="date" id="etut-date-to" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="bg-surface border border-line rounded-xl px-3 py-1.5 text-sm text-fg" />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted" id="etut-list-count">
            {`${viewMode === 'calendar' ? calendarEtuts.length : viewMode === 'cards' ? cardEtuts.length : listEtuts.length} etüt listeleniyor`}
            {!wideView && ' · yalnız sizin etütleriniz'}
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            {viewMode === 'cards' && <EtutStatusLegend />}
            {filtersOn && (
              <button type="button" id="etut-filter-clear" onClick={clearFilters} className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer">
                Süzgeçleri temizle
              </button>
            )}
          </div>
        </div>
      </div>

      )}

      {/* Main Content: Weekly Calendar View, Cards Grid, or Dedicated Attendance Section */}
      {viewMode === 'calendar' && (
        <WeeklyEtutCalendar
          etuts={calendarEtuts}
          students={students}
          classes={classes}
          onAddEtutForDate={handleAddEtutForDate}
          onEditEtut={openEdit}
          onCopyEtut={openCopy}
          onDeleteEtut={(etut) => setEtutToDelete(etut)}
          canEditEtut={canEditEtut}
          onViewEtut={setViewEtut}
          onNotifyEtut={(etut) => {
            setSelectedEtutForDispatch(etut);
            setIsDispatchModalOpen(true);
          }}
          onAttendanceEtut={(etut) => {
            setSelectedAttendanceEtutId(etut.id);
            setListSubject('all');
            setListTeacher('all');
            setListTime('all');
            setDatePreset('all');
            setViewMode('attendance');
          }}
        />
      )}

      {viewMode === 'cards' && (
        /* Etüt List */
        <div className="space-y-3">
        {cardEtuts.length === 0 && (
          <div className="ui-card p-8 text-center text-sm text-muted">Bu seçimde etüt yok.</div>
        )}
        <div className="space-y-2" id="etut-list-grid">
          {pagedListEtuts.visible.map((etut) => {
            const assignedStudents = etut.privacyRedacted
              ? []
              : etut.assignedStudentIds === 'all'
                ? students
                : students.filter((s) => (etut.assignedStudentIds as string[]).includes(s.id));
            const att = etut.studentAttendance ? Object.values(etut.studentAttendance) : [];
            const present = att.filter((a) => a.status === 'present').length;
            const absent = att.filter((a) => a.status === 'absent').length;
            const late = att.filter((a) => a.status === 'late').length;
            const isOpen = expandedEtutId === etut.id;
            // Aşama 24: etüt bitti mi, bittiyse yoklaması alınmış mı
            const ended = isEtutEnded(etut);
            const status = getEtutStatus(etut);
            const missingAtt = ended && etutExpectsAttendance(etut) && !hasEtutAttendance(etut);
            const dateText = new Date(etut.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short' });

            return (
              <ExpandableStrip
                key={etut.id}
                id={`etut-strip-${etut.id}`}
                noun="Etüt"
                open={isOpen}
                onToggle={() => setExpandedEtutId(isOpen ? null : etut.id)}
                accent={ETUT_STATUS_STYLE[status].accent}
                className={`bg-surface ${status === 'past' ? 'opacity-90' : ''}`}
                badges={
                  <>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                      {etut.subject}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dateText} · {etut.time ? `${etut.time} (${etut.duration} dk)` : 'Saat belirtilmedi'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ETUT_STATUS_STYLE[status].chip}`} data-etut-status={status}>
                      {ETUT_STATUS_STYLE[status].label}
                    </span>
                    {missingAtt && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Yoklama alınmadı
                      </span>
                    )}
                    {etut.gradeLevel && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
                        {etut.gradeLevel}
                      </span>
                    )}
                    {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-2 text-fg-2">{etut.lessonPeriod}</span>
                    )}
                  </>
                }
                title={etut.topic}
                meta={[etut.location, etut.teacherName ? `Öğretmen: ${etut.teacherName}` : '', `${assignedStudents.length} öğrenci`].filter(Boolean).join(' · ')}
                stats={
                  <div className="text-[11px] font-semibold">
                    <span className="text-muted block">Yoklama</span>
                    {att.length > 0 ? (
                      <span className="flex flex-wrap gap-x-2">
                        <span className="text-emerald-700 dark:text-emerald-300">{present} Geldi</span>
                        <span className="text-rose-600 dark:text-rose-300">{absent} Gelmedi</span>
                        {late > 0 && <span className="text-amber-700 dark:text-amber-300">{late} Geç</span>}
                      </span>
                    ) : (
                      missingAtt ? (
                        <span className="text-rose-700 dark:text-rose-300 font-bold">Alınmadı</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300 font-normal">Yoklama henüz alınmadı</span>
                      )
                    )}
                  </div>
                }
                actions={
                  etut.privacyRedacted ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted px-2" data-etut-private title="Konu, yorumlar ve yoklama yalnızca etüdü veren öğretmen ve yöneticiye görünür">
                      <Lock className="w-3.5 h-3.5" /> Başka öğretmenin etüdü
                    </span>
                  ) : !canEditEtut(etut) ? (
                    /* Aşama 111: Rehberlik / Zümre başkasının etüdünü yalnız görür */
                    <StripAction label="Yoklamayı görüntüle" id={`btn-view-etut-${etut.id}`} title="Yoklama ve yorumlar (salt okunur)" onClick={() => setViewEtut(etut)}>
                      <Eye className="w-4 h-4" />
                    </StripAction>
                  ) : (
                  <>
                    <StripAction label="Yoklama Al" tone="success" onClick={() => setSelectedEtutForAttendance(etut)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </StripAction>
                    <StripAction label="Etüdü kopyala" id={`btn-copy-etut-${etut.id}`} title="Kopyala (başka tarihe yeniden tanımla)" onClick={() => openCopy(etut)}>
                      <Copy className="w-4 h-4" />
                    </StripAction>
                    <StripAction label="Etüdü düzenle" title="Düzenle" onClick={() => openEdit(etut)}>
                      <Edit2 className="w-4 h-4" />
                    </StripAction>
                    <StripAction label="Etüdü sil" title="Etütü Sil" tone="danger" onClick={() => setEtutToDelete(etut)}>
                      <Trash2 className="w-4 h-4" />
                    </StripAction>
                  </>
                  )
                }
              >
                <div className="grid gap-4 lg:grid-cols-2" data-etut-detail>
                  <div className="space-y-2 text-xs text-muted min-w-0">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                      <span className="text-fg font-medium">
                        {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time ? `${etut.time} (${etut.duration} dk)` : 'Saat belirtilmedi'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span className="text-fg-2 font-medium">{etut.location}</span>
                    </div>
                    {etut.teacherName && (
                      <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-semibold">
                        <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
                        <span>
                          Öğretmen: <strong>{etut.teacherName}</strong> {etut.teacherBranch ? `(${etut.teacherBranch})` : ''}
                        </span>
                      </div>
                    )}
                    {etut.schoolLevel && <div>{etut.schoolLevel}</div>}
                    {etut.notes && (
                      <p className="text-[11px] text-muted italic pt-1 border-t border-line">
                        <span className="font-semibold text-fg-2 not-italic">Açıklama:</span> {etut.notes}
                      </p>
                    )}
                    {etut.teacherFeedback && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-[11px]">
                          <MessageSquareQuote className="w-3.5 h-3.5 shrink-0" />
                          <span>Öğretmen Görüş ve Düşünceleri:</span>
                        </div>
                        <p className="italic text-fg-2 leading-relaxed font-normal">"{etut.teacherFeedback}"</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!etut.privacyRedacted && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEtutForDispatch(etut);
                          setIsDispatchModalOpen(true);
                        }}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="WhatsApp ve Mail ile İlet"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" /> WhatsApp / Mail
                      </button>
                      )}
                      <a
                        href={createGoogleCalendarUrlForEtut(etut)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="Google Takvime Ekle"
                      >
                        <CalendarCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" /> Google Takvim
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          downloadIcsFile(
                            `etut-${etut.subject}-${etut.date}`,
                            `[ETÜT] ${etut.subject}: ${etut.topic}`,
                            etut.notes || `${etut.location} yerinde etüt çalışması`,
                            `${etut.date}T${etut.time || '14:00'}:00`,
                            etut.duration,
                            etut.location
                          )
                        }
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        title="Takvim dosyası indir"
                      >
                        <CalendarDays className="w-3.5 h-3.5" /> Takvim dosyası
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center justify-between">
                      <span>Katılacak Öğrenciler ({assignedStudents.length})</span>
                      {etut.assignedStudentIds === 'all' && <span className="text-[10px] text-indigo-600 dark:text-indigo-300 font-bold">Tümü Dahil</span>}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {assignedStudents.map((std) => {
                        const st = etut.studentAttendance?.[std.id]?.status;
                        return (
                          <button
                            type="button"
                            key={std.id}
                            onClick={() => {
                              setReportSelectedStudentId(std.id);
                              setIsReportModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] bg-surface-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-fg-2 px-2 py-0.5 rounded-md border border-line transition-colors cursor-pointer"
                            title={`${std.name} için etüt analizini görüntüle`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                st === 'present' ? 'bg-emerald-500' : st === 'absent' ? 'bg-rose-500' : st === 'late' ? 'bg-amber-500' : 'bg-indigo-500'
                              }`}
                            ></span>
                            <span>{std.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ExpandableStrip>
            );
          })}
        </div>
        <ShowMoreBar
          id="etut-list-show-more"
          remaining={pagedListEtuts.remaining}
          total={pagedListEtuts.total}
          shown={pagedListEtuts.visible.length}
          onMore={pagedListEtuts.showMore}
          onAll={pagedListEtuts.showAll}
          step={30}
        />
        </div>
      )}

      {/* DEDICATED SIMPLE ETÜT DEVAMSIZLIK ARAYÜZÜ */}
      {viewMode === 'attendance' && (() => {
        // Aşama 40: başka öğretmenin etüdünün yoklaması alınamaz / görülemez
        // Aşama 111: yoklama yalnız düzenleyebildiği etütlerde alınır (Rehberlik başkasınınkini Takip'te görür)
        const attEtuts = listEtuts.filter((e) => canEditEtut(e));
        const currentAttendanceEtut =
          attEtuts.find((e) => e.id === selectedAttendanceEtutId) || attEtuts[0] || null;

        // Atanan öğrenciler listesi
        const assignedStudents = (() => {
          if (!currentAttendanceEtut) return [];
          if (currentAttendanceEtut.assignedStudentIds === 'all') {
            return students;
          }
          const ids = Array.isArray(currentAttendanceEtut.assignedStudentIds)
            ? currentAttendanceEtut.assignedStudentIds
            : [];
          return students.filter((s) => ids.includes(s.id));
        })();

        // Filtrelenmiş öğrenci listesi
        const displayedStudents = assignedStudents.filter((std) => {
          if (!attendanceSearchQuery.trim()) return true;
          const q = attendanceSearchQuery.toLowerCase().trim();
          return (
            std.name.toLowerCase().includes(q) ||
            (std.studentNumber && std.studentNumber.includes(q)) ||
            (std.className && std.className.toLowerCase().includes(q))
          );
        });

        // Sayaçlar
        let countPresent = 0;
        let countAbsent = 0;
        let countLate = 0;
        let countExcused = 0;

        assignedStudents.forEach((std) => {
          const rec = currentAttendanceEtut?.studentAttendance?.[std.id];
          const st = rec?.status || 'present';
          if (st === 'present') countPresent++;
          else if (st === 'absent') countAbsent++;
          else if (st === 'late') countLate++;
          else if (st === 'excused') countExcused++;
        });

        const handleSingleAttendanceChange = (
          studentId: string,
          studentName: string,
          status: 'present' | 'absent' | 'late' | 'excused'
        ) => {
          if (!currentAttendanceEtut) return;
          const note = attendanceNotes[studentId] || currentAttendanceEtut.studentAttendance?.[studentId]?.note || '';
          dataService.updateEtutAttendance(currentAttendanceEtut.id, {
            [studentId]: {
              ...(currentAttendanceEtut.studentAttendance?.[studentId] || {}),
              studentId,
              studentName,
              status,
              note,
              updatedAt: new Date().toISOString(),
            },
          });
          const label =
            status === 'present'
              ? 'Geldi'
              : status === 'absent'
              ? 'Gelmedi'
              : status === 'late'
              ? 'Geç Kaldı'
              : 'İzinli';
          setAttendanceFeedback(`✓ ${studentName}: "${label}" olarak kaydedildi.`);
        };

        const handleBulkEtutAttendance = (status: 'present' | 'absent' | 'excused') => {
          if (!currentAttendanceEtut || assignedStudents.length === 0) return;
          const map: Record<string, any> = {};
          assignedStudents.forEach((std) => {
            const note = attendanceNotes[std.id] || currentAttendanceEtut.studentAttendance?.[std.id]?.note || '';
            map[std.id] = {
              ...(currentAttendanceEtut.studentAttendance?.[std.id] || {}),
              studentId: std.id,
              studentName: std.name,
              status,
              note,
              updatedAt: new Date().toISOString(),
            };
          });
          dataService.updateEtutAttendance(currentAttendanceEtut.id, map);
          const label = status === 'present' ? 'Geldi' : status === 'absent' ? 'Gelmedi' : 'İzinli';
          setAttendanceFeedback(`✓ Tüm öğrenciler "${label}" olarak güncellendi.`);
        };

        if (attEtuts.length === 0 && activeEtuts.length > 0) {
          return (
            <div className="ui-card p-8 text-center text-sm text-muted" id="etut-attendance-empty-filter">
              Bu süzgeçte yoklaması alınacak etüt yok.{' '}
              <button type="button" onClick={clearFilters} className="font-semibold text-brand-fg hover:underline cursor-pointer">
                Süzgeçleri temizle
              </button>
            </div>
          );
        }
        if (attEtuts.length === 0) {
          return (
            <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <CalendarCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-fg mb-2">Henüz Kayıtlı Etüt Bulunmuyor</h3>
              <p className="text-sm text-muted max-w-md mx-auto mb-6">
                Yoklama alabilmek için lütfen önce bir etüt oluşturunuz.
              </p>
              <button
                type="button"
                onClick={() => {
                  openEtutForm('create');
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/25 cursor-pointer inline-flex items-center space-x-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>İlk Etütü Planla</span>
              </button>
            </div>
          );
        }

        return (
          <div className="space-y-5">
            {/* Bildirim Çubuğu */}
            {attendanceFeedback && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>{attendanceFeedback}</span>
              </div>
            )}

            {/* 1. ETÜT SEÇİMİ AÇILIR MENÜSÜ */}
            <div className="bg-surface border border-line rounded-2xl p-4 sm:p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-fg">Yoklaması Alınacak Etütü Seçiniz</h3>
                    <p className="text-xs text-muted">
                      Öğrencilerin devamsızlığını girmek için listeden ilgili etüt çalışmasını seçin.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 self-start sm:self-auto">
                  {attEtuts.length} Planlı Etüt
                </span>
              </div>

              {/* AÇILIR MENÜ */}
              <div className="relative">
                <select
                  value={currentAttendanceEtut?.id || ''}
                  onChange={(e) => {
                    setSelectedAttendanceEtutId(e.target.value);
                    ackMissing([e.target.value]); // Aşama 33d: eksik etüt seçilince yanıp sönme durur
                  }}
                  className="w-full bg-canvas border-2 border-indigo-500/50 hover:border-indigo-400 rounded-xl px-4 py-3 text-sm font-bold text-fg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-inner"
                >
                  {attEtuts.map((e) => {
                    let formattedDate = e.date;
                    try {
                      const parts = (e.date || '').trim().split('T')[0].split('-');
                      if (parts.length === 3) formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                      else formattedDate = new Date(e.date).toLocaleDateString('tr-TR');
                    } catch {}
                    return (
                      <option key={e.id} value={e.id} className="bg-surface text-fg py-2">
                        {isEtutEnded(e) && etutExpectsAttendance(e) && !hasEtutAttendance(e) ? '⚠ YOKLAMA ALINMADI · ' : ''}
                        [{formattedDate} • {e.time}] [{e.subject}] {e.topic} — {e.location} {e.teacherName ? `(Öğr: ${e.teacherName})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Seçili Etüt Detay Paneli */}
              {currentAttendanceEtut && (
                <div className="mt-3.5 p-3.5 rounded-xl bg-canvas/70 border border-line flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                      {currentAttendanceEtut.subject}
                    </span>
                    <span className="text-sm font-bold text-fg">{currentAttendanceEtut.topic}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                      <span>{new Date(currentAttendanceEtut.date).toLocaleDateString('tr-TR')} • {currentAttendanceEtut.time ? `${currentAttendanceEtut.time} (${currentAttendanceEtut.duration} dk)` : 'Saat belirtilmedi'}</span>
                    </span>
                    <span className="flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>{currentAttendanceEtut.location}</span>
                    </span>
                    {currentAttendanceEtut.teacherName && (
                      <span className="flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-300 font-medium">
                        <Users className="w-3.5 h-3.5" />
                        <span>{currentAttendanceEtut.teacherName}</span>
                      </span>
                    )}
                  </div>
                  {currentAttendanceEtut.teacherFeedback && (
                    <div className="w-full mt-2 pt-2 border-t border-line flex items-start space-x-2 text-xs text-amber-700/90 dark:text-amber-200/90 bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/15">
                      <MessageSquareQuote className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-amber-700 dark:text-amber-300 font-semibold block text-[11px]">Öğretmen Görüş ve Düşünceleri:</strong>
                        <span className="italic text-fg-2 font-normal">"{currentAttendanceEtut.teacherFeedback}"</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. ETÜTTEKİ ÖĞRENCİLER VE DEVAMSIZLIK LİSTESİ */}
            {currentAttendanceEtut && (
              <div className="bg-surface border border-line rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
                {/* Header & Arama */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-fg">
                        Etüt Öğrenci Yoklama Listesi
                      </h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                        {assignedStudents.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Öğrencinin devamsızlık durumunu tek tıkla işaretleyin.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={attendanceSearchQuery}
                      onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                      placeholder="Öğrenci ara..."
                      className="w-full bg-canvas border border-line rounded-xl pl-8 pr-3 py-1.5 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Sayaçlar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="p-2.5 rounded-xl bg-canvas/70 border border-line text-center">
                    <span className="text-[10px] uppercase font-bold text-muted block">Toplam</span>
                    <span className="text-base font-bold text-fg">{assignedStudents.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Geldi</span>
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">{countPresent}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block">Gelmedi</span>
                    <span className="text-base font-bold text-rose-600 dark:text-rose-300">{countAbsent}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block">Geç Kaldı</span>
                    <span className="text-base font-bold text-amber-700 dark:text-amber-300">{countLate}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-center">
                    <span className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-400 block">İzinli</span>
                    <span className="text-base font-bold text-sky-700 dark:text-sky-300">{countExcused}</span>
                  </div>
                </div>

                {/* Toplu İşlem Butonları */}
                <div className="p-3 rounded-xl bg-canvas/60 border border-line flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg-2">
                    Hızlı Toplu Yoklama:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('present')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>✓ Tümü Geldi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('absent')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>✕ Tümü Gelmedi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEtutAttendance('excused')}
                      className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>ℹ Tümü İzinli</span>
                    </button>
                  </div>
                </div>

                {/* ALT ALTA SIRALI ÖĞRENCİ LİSTESİ */}
                {assignedStudents.length === 0 ? (
                  <div className="p-8 text-center text-muted text-xs bg-canvas/40 rounded-xl border border-line">
                    Bu etüte henüz öğrenci atanmamış. Etütü düzenleyerek öğrenci ekleyebilirsiniz.
                  </div>
                ) : displayedStudents.length === 0 ? (
                  <div className="p-8 text-center text-muted text-xs bg-canvas/40 rounded-xl border border-line">
                    "{attendanceSearchQuery}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-canvas/50">
                    {displayedStudents.map((std, idx) => {
                      const att = currentAttendanceEtut.studentAttendance?.[std.id];
                      const currentStatus = att?.status || 'present';
                      return (
                        <div
                          key={std.id}
                          className="p-3 sm:p-3.5 hover:bg-surface-2/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          {/* Öğrenci Bilgisi */}
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-6 text-center text-xs font-mono text-muted shrink-0">
                              {idx + 1}
                            </span>
                            <img
                              src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                              alt={std.name}
                              className="w-8 h-8 rounded-full bg-surface-2 object-cover border border-line shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-fg truncate">{std.name}</h4>
                            </div>
                          </div>

                          {/* 4 Seçenek Butonu: GELDI, GELMEDI, GEÇ KALDI, İZİNLİ */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                            {/* Geldi */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'present')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'present'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400'
                                  : 'bg-surface hover:bg-emerald-600/20 text-fg-2 hover:text-emerald-700 dark:hover:text-emerald-300 border border-line hover:border-emerald-500/40'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Geldi</span>
                            </button>

                            {/* Gelmedi */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'absent')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'absent'
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-400'
                                  : 'bg-surface hover:bg-rose-600/20 text-fg-2 hover:text-rose-600 dark:hover:text-rose-300 border border-line hover:border-rose-500/40'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Gelmedi</span>
                            </button>

                            {/* Geç Kaldı */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'late')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'late'
                                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 ring-2 ring-amber-400'
                                  : 'bg-surface hover:bg-amber-600/20 text-fg-2 hover:text-amber-700 dark:hover:text-amber-300 border border-line hover:border-amber-500/40'
                              }`}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Geç Kaldı</span>
                            </button>

                            {/* İzinli */}
                            <button
                              type="button"
                              onClick={() => handleSingleAttendanceChange(std.id, std.name, 'excused')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'excused'
                                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 ring-2 ring-sky-400'
                                  : 'bg-surface hover:bg-sky-600/20 text-fg-2 hover:text-sky-700 dark:hover:text-sky-300 border border-line hover:border-sky-500/40'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>İzinli</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* CREATE/EDIT ETUT MODAL */}
      {/* CONFIRM DELETE ETUT MODAL */}
      <ConfirmDeleteModal
        isOpen={!!etutToDelete}
        onClose={() => setEtutToDelete(null)}
        onConfirm={handleConfirmDeleteEtut}
        title="Etütü Sil"
        itemBadge={etutToDelete ? `${etutToDelete.subject} • ${etutToDelete.date} ${etutToDelete.time}` : undefined}
        description={`"${etutToDelete?.topic}" başlıklı etüt planını silmek istediğinize emin misiniz? Bu işlem geri alınamaz. Yapılmamış bir etütse etüt öğretmenine iptal e-postası gönderilir.`}
        confirmButtonText="Etütü Sil"
      />

      {/* Giden E-Posta & Bildirim İletim Günlüğü */}
      <SentCommunicationsModal
        isOpen={isSentCommunicationsOpen}
        onClose={() => setIsSentCommunicationsOpen(false)}
      />

      {/* Etüt listesi indirme penceresi (Aşama 27; yalnızca açıkken çizilir) */}
      {isScheduleExportOpen && (
        <EtutScheduleExportModal onClose={() => setIsScheduleExportOpen(false)} etuts={activeEtuts.filter((e) => !e.privacyRedacted)} students={students} classes={classes} />
      )}

      {/* Aşama 115: branş etüt listesi (yalnızca açıkken çizilir) */}
      {isBransListOpen && (
        <Suspense fallback={null}>
          <EtutBransListesiModal onClose={() => setIsBransListOpen(false)} etuts={etuts} students={students} classes={classes} />
        </Suspense>
      )}

      {/* Etüt Analizi (yalnızca açıkken çizilir; her açılışta durum sıfırlanır) */}
      {isReportModalOpen && (
        <EtutAnalysisReportModal
          onClose={() => {
            setIsReportModalOpen(false);
            setReportSelectedStudentId(undefined);
          }}
          etuts={etuts.filter((e) => !e.privacyRedacted) /* Aşama 40: başka öğretmenin etüdü rapora girmez */}
          students={students}
          classes={classes}
          preselectedStudentId={reportSelectedStudentId}
          defaultScope={scope}
        />
      )}

      {/* Etüt Bilgilendirme ve İletişim (WhatsApp & Otomatik Mail) Modalı */}
      <EtutNotificationModal
        isOpen={isDispatchModalOpen}
        onClose={() => {
          setIsDispatchModalOpen(false);
          setSelectedEtutForDispatch(null);
        }}
        etut={selectedEtutForDispatch}
        students={students}
      />

      {/* Etüt Yoklama ve Devamsızlık Takibi Modalı */}
      {selectedEtutForAttendance && (
        <EtutAttendanceModal
          isOpen={!!selectedEtutForAttendance}
          onClose={() => setSelectedEtutForAttendance(null)}
          etut={selectedEtutForAttendance}
          allStudents={students}
        />
      )}

      {viewEtut && (
        <Suspense fallback={null}>
          <EtutDetayModal
            etut={viewEtut}
            students={students}
            classes={classes}
            canEdit={canEditEtut(viewEtut)}
            onClose={() => setViewEtut(null)}
            onEditAttendance={(e: Etut) => {
              setViewEtut(null);
              setSelectedEtutForAttendance(e);
            }}
          />
        </Suspense>
      )}

      {/* ETÜT OLUŞTUR / DÜZENLE */}
      <EtutFormModal
        open={!!etutForm}
        mode={etutForm?.mode || 'create'}
        source={etutForm?.source || null}
        initialDate={etutForm?.initialDate || null}
        students={students}
        classes={classes}
        etuts={dataService.getEtuts() /* Aşama 111: çakışma denetimi ortak takvim satırlarıyla birlikte */}
        onClose={() => setEtutForm(null)}
        onSaved={handleEtutSaved}
        onManageTeachers={() => setIsTeacherManagerOpen(true)}
        teacherListVersion={teacherListVersion}
      />

      {/* ETÜT ÖĞRETMENLERİ (YÖNETİCİ) */}
      <EtutTeacherManagerModal
        open={isTeacherManagerOpen}
        onClose={() => setIsTeacherManagerOpen(false)}
        onChanged={() => setTeacherListVersion((v) => v + 1)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Öğretmen süzgeci — özel açılır liste (Aşama 32)
// Yoklama görünümünde, biten etüdünün yoklamasını almamış öğretmenler kırmızı yanıp söner.
// ---------------------------------------------------------------------------
const TeacherPicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: Array<[string, number]>;
  missing: Map<string, number>;
  /** Yanıp sönmesi gereken öğretmenler (eksik yoklaması olup henüz tıklanmamış) */
  blinking: Set<string>;
  /** Yanıp sönen öğretmen seçilince çağrılır (o öğretmenin eksik etütleri "görüldü" sayılır) */
  onAcknowledge: (teacher: string) => void;
  blink: boolean;
}> = ({ value, onChange, allLabel, options, missing, blinking, onAcknowledge, blink }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const totalMissing = Array.from(missing.values()).reduce((a, b) => a + b, 0);
  const missingTeachers = options.filter(([t]) => (missing.get(t) || 0) > 0).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = value === 'all' ? allLabel : `${value} (${options.find(([t]) => t === value)?.[1] ?? 0})`;
  const currentMissing = value !== 'all' ? missing.get(value) || 0 : 0;
  const triggerBlink = blink && (value === 'all' ? blinking.size > 0 : blinking.has(value) && currentMissing > 0);

  const pick = (v: string) => {
    if (v !== 'all' && blinking.has(v)) onAcknowledge(v);
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        id="etut-list-teacher"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="etut-list-teacher-label etut-list-teacher"
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-10 flex items-center justify-between gap-2 bg-surface border border-line rounded-xl px-3 text-sm text-fg text-left cursor-pointer focus:outline-none focus:border-brand ${
          triggerBlink ? 'notify-blink notify-blink-rose' : ''
        }`}
      >
        {/* Görünmeyen ölçü yazıları: düğme, listedeki EN UZUN seçenek kadar geniş olur (diğer kutularla eşitlenebilsin) */}
        <span className="grid min-w-0">
          <span className="truncate [grid-area:1/1]">{current}</span>
          {[allLabel, ...options.map(([t, n]) => `${t} (${n})`)].map((label) => (
            <span key={label} aria-hidden className="invisible h-0 overflow-hidden whitespace-nowrap [grid-area:1/1]">
              {label}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {blink && totalMissing > 0 && (
            <span className="text-[10px] font-black text-rose-600 dark:text-rose-300" title={`${missingTeachers} öğretmen, ${totalMissing} etüt yoklaması eksik`}>
              ⚠ {missingTeachers}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby="etut-list-teacher-label"
          className="absolute z-40 mt-1.5 left-0 right-0 max-h-72 overflow-y-auto bg-surface border border-line rounded-xl shadow-pop p-1.5 space-y-1"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === 'all'}
              onClick={() => pick('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer ${value === 'all' ? 'bg-brand-soft text-brand-fg font-semibold' : 'hover:bg-surface-2 text-fg'}`}
            >
              {allLabel}
            </button>
          </li>
          {options.map(([t, n]) => {
            const miss = missing.get(t) || 0;
            const flag = blink && miss > 0 && blinking.has(t); // yanıp sönme (tıklanınca durur)
            const showMiss = blink && miss > 0; // "N yoklama eksik" yazısı yoklama alınana kadar kalır
            return (
              <li key={t}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === t}
                  data-missing-attendance={miss || undefined}
                  onClick={() => pick(t)}
                  className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm cursor-pointer border border-transparent ${
                    flag ? 'notify-blink notify-blink-rose font-semibold text-fg' : value === t ? 'bg-brand-soft text-brand-fg font-semibold' : 'hover:bg-surface-2 text-fg'
                  }`}
                >
                  <span className="truncate">
                    {t} ({n})
                  </span>
                  {showMiss && <span className="shrink-0 text-[11px] font-black text-rose-700 dark:text-rose-300">{miss} yoklama eksik</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
