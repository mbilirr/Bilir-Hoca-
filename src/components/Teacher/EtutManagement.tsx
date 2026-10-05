import React, { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Etut, Student, ClassGroup, Teacher } from '../../types';
import { dataService } from '../../services/dataService';
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

interface EtutManagementProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
}

export const EtutManagement: React.FC<EtutManagementProps> = ({ etuts, students, classes }) => {
  const [viewMode, setViewMode] = useState<'calendar' | 'cards' | 'attendance'>('calendar');
  const [selectedAttendanceEtutId, setSelectedAttendanceEtutId] = useState<string>(etuts[0]?.id || '');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState<string>('');
  const [attendanceFeedback, setAttendanceFeedback] = useState<string | null>(null);
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({});
  const [isSentCommunicationsOpen, setIsSentCommunicationsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportSelectedStudentId, setReportSelectedStudentId] = useState<string | undefined>(undefined);

  // Ana sayfa kısayolu: yeni etüt penceresini aç
  useQuickFocus(['action'], (f) => {
    if (f.id === 'etut-create') {
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

  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');

  const myEtuts = useMemo(() => {
    if (!currentTeacher) return etuts;
    const tName = (currentTeacher.name || '').trim().toLowerCase();
    const tUser = (currentTeacher.username || '').trim().toLowerCase();
    const tBranch = (currentTeacher.branch || '').trim().toLowerCase();

    return etuts.filter((e) => {
      if (e.teacherId && e.teacherId === currentTeacher.id) return true;
      if (e.teacherName && e.teacherName.trim().toLowerCase() === tName) return true;
      if (e.teacherName && e.teacherName.trim().toLowerCase() === tUser) return true;
      if (tBranch && (e.teacherBranch?.toLowerCase() === tBranch || e.subject?.toLowerCase() === tBranch)) return true;
      return false;
    });
  }, [etuts, currentTeacher]);

  const activeEtuts = scopeFilter === 'mine' ? myEtuts : etuts;

  // Etüt oluştur / düzenle penceresi (Aşama 9)
  const [etutForm, setEtutForm] = useState<{ mode: 'create' | 'edit' | 'copy'; source: Etut | null; initialDate: string | null } | null>(null);
  const openEtutForm = (mode: 'create' | 'edit' | 'copy', source: Etut | null = null, initialDate: string | null = null) =>
    setEtutForm({ mode, source, initialDate });
  const openEdit = (etut: Etut) => openEtutForm('edit', etut);
  const openCopy = (etut: Etut) => openEtutForm('copy', etut);
  const handleAddEtutForDate = (dateStr: string) => openEtutForm('create', null, dateStr);
  const [isTeacherManagerOpen, setIsTeacherManagerOpen] = useState(false);
  const [teacherListVersion, setTeacherListVersion] = useState(0);
  const [mailNotice, setMailNotice] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null>(null);
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
      setMailNotice({ tone: r.failedCount ? 'warning' : 'success', text: base });
      return;
    }
    setMailNotice({ tone: 'info', text: `${base} E-postalar gönderiliyor…` });
    let total: MailResult | null = null;
    for (const e of r.etuts) {
      const res =
        r.mode !== 'edit'
          ? await callMail('etut-created', { etutId: e.id })
          : await callMail('etut-changed', { etutId: e.id, changes: r.changes || [], previousTeacherId: r.previousTeacherId || null });
      if (!total) total = res;
      else {
        total = {
          ...total,
          ok: total.ok && res.ok,
          sent: (total.sent || 0) + (res.sent || 0),
          failed: (total.failed || 0) + (res.failed || 0),
          skipped: (total.skipped || 0) + (res.skipped || 0),
          errors: [...(total.errors || []), ...(res.errors || [])].slice(0, 3),
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
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    let mailText = '';
    // Yapılmamış (bugün veya ileri tarihli) etüt iptal edilirse etüt öğretmenine haber ver
    if (etut.date >= todayStr && etut.teacherId) {
      const res = await callMail('etut-cancelled', { etutId: etut.id });
      if (res.ok && res.sent) mailText = ' Etüt öğretmenine iptal e-postası gönderildi.';
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
        <Segmented
          value={scopeFilter}
          onChange={(v) => setScopeFilter(v)}
          items={[
            { value: 'all', label: `Tüm Okul (${etuts.length})` },
            { value: 'mine', label: `Benim Etütlerim (${myEtuts.length})` },
          ]}
        />
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v)}
          items={[
            { value: 'calendar', label: 'Haftalık Takvim', icon: CalendarDays },
            { value: 'cards', label: `Liste (${activeEtuts.length})`, icon: LayoutGrid },
            { value: 'attendance', label: 'Yoklama', icon: CalendarCheck },
          ]}
        />
      </div>

      {/* Main Content: Weekly Calendar View, Cards Grid, or Dedicated Attendance Section */}
      {viewMode === 'calendar' && (
        <WeeklyEtutCalendar
          etuts={activeEtuts}
          students={students}
          classes={classes}
          onAddEtutForDate={handleAddEtutForDate}
          onEditEtut={openEdit}
          onCopyEtut={openCopy}
          onDeleteEtut={(etut) => setEtutToDelete(etut)}
          onNotifyEtut={(etut) => {
            setSelectedEtutForDispatch(etut);
            setIsDispatchModalOpen(true);
          }}
          onAttendanceEtut={(etut) => {
            setSelectedAttendanceEtutId(etut.id);
            setViewMode('attendance');
          }}
        />
      )}

      {viewMode === 'cards' && (
        /* Etüt List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeEtuts.map((etut) => {
            const assignedStudents =
              etut.assignedStudentIds === 'all'
                ? students
                : students.filter((s) => (etut.assignedStudentIds as string[]).includes(s.id));

            return (
              <div
                key={etut.id}
                className="bg-surface border border-line rounded-2xl p-5 hover:border-line-strong hover:shadow-xl transition-all flex flex-col justify-between shadow-md relative group text-fg"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                        {etut.subject}
                      </span>
                      {etut.schoolLevel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-2 text-fg-2 border border-line">
                          {etut.schoolLevel === 'Ortaokul' ? '🏫 Ortaokul' : '🎓 Lise'}
                        </span>
                      )}
                      {etut.gradeLevel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                          {etut.gradeLevel}
                        </span>
                      )}
                      {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30">
                          {etut.lessonPeriod}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        id={`btn-copy-etut-${etut.id}`}
                        onClick={() => openCopy(etut)}
                        className="p-1.5 text-subtle hover:text-fg-2 hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                        title="Kopyala (başka tarihe yeniden tanımla)"
                        aria-label="Etüdü kopyala"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(etut)}
                        className="p-1.5 text-subtle hover:text-fg-2 hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                        title="Düzenle"
                        aria-label="Etüdü düzenle"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEtutToDelete(etut)}
                        className="p-1.5 text-subtle hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Etütü Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-fg mb-2 line-clamp-2">{etut.topic}</h3>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-muted mb-4 bg-surface-2 p-3 rounded-xl border border-line">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
                      <span className="text-fg font-medium">
                        {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time} ({etut.duration} dk)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span className="text-fg-2 font-medium">{etut.location}</span>
                    </div>
                    {etut.teacherName && (
                      <div className="flex items-center space-x-2 text-indigo-900 dark:text-indigo-200 font-semibold">
                        <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
                        <span>Öğretmen: <strong>{etut.teacherName}</strong> {etut.teacherBranch ? `(${etut.teacherBranch})` : ''}</span>
                      </div>
                    )}
                    {etut.notes && (
                      <p className="text-[11px] text-muted italic pt-1 border-t border-line mt-1">
                        <span className="font-semibold text-fg-2 not-italic">Açıklama:</span> {etut.notes}
                      </p>
                    )}
                    {etut.teacherFeedback && (
                      <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                        <div className="flex items-center space-x-1.5 font-bold text-amber-800 dark:text-amber-200 text-[11px]">
                          <MessageSquareQuote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0" />
                          <span>Öğretmen Görüş ve Düşünceleri:</span>
                        </div>
                        <p className="italic text-fg-2 leading-relaxed font-normal">
                          "{etut.teacherFeedback}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Attendance Summary & Button */}
                  <div className="mb-4 p-2.5 bg-surface-2 rounded-xl border border-line flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Yoklama / Devamsızlık
                      </div>
                      <div className="text-xs font-bold mt-0.5">
                        {etut.studentAttendance && Object.keys(etut.studentAttendance).length > 0 ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                              {Object.values(etut.studentAttendance).filter((a) => a.status === 'present').length} Geldi
                            </span>
                            <span className="text-subtle">•</span>
                            <span className="text-rose-600 dark:text-rose-300 font-bold">
                              {Object.values(etut.studentAttendance).filter((a) => a.status === 'absent').length} Gelmedi
                            </span>
                            {Object.values(etut.studentAttendance).filter((a) => a.status === 'late').length > 0 && (
                              <>
                                <span className="text-subtle">•</span>
                                <span className="text-amber-700 dark:text-amber-300 font-bold">
                                  {Object.values(etut.studentAttendance).filter((a) => a.status === 'late').length} Geç
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-300 text-[11px] font-normal">
                            Yoklama henüz alınmadı
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedEtutForAttendance(etut)}
                      className="px-2.5 py-1 bg-surface hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-xs"
                      title="Etüte gelen ve gelmeyen öğrencileri işaretle"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
                      <span>Yoklama Al</span>
                    </button>
                  </div>

                  {/* Assigned Students */}
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center justify-between">
                      <span>Katılacak Öğrenciler ({assignedStudents.length})</span>
                      {etut.assignedStudentIds === 'all' && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-300 font-bold">Tümü Dahil</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {assignedStudents.map((std) => (
                        <button
                          type="button"
                          key={std.id}
                          onClick={() => {
                            setReportSelectedStudentId(std.id);
                            setIsReportModalOpen(true);
                          }}
                          className="inline-flex items-center space-x-1 text-[11px] bg-surface-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-800 dark:hover:text-indigo-200 text-fg-2 px-2 py-0.5 rounded-md border border-line transition-colors cursor-pointer"
                          title={`${std.name} için etüt analizini görüntüle`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          <span>{std.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEtutForDispatch(etut);
                      setIsDispatchModalOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2.5 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    title="WhatsApp ve Mail ile İlet"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
                    <span>WhatsApp / Mail</span>
                  </button>

                  <a
                    href={createGoogleCalendarUrlForEtut(etut)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-1 py-1.5 px-2.5 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 rounded-xl text-xs font-medium transition-all"
                    title="Google Takvime Ekle"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
                  </a>

                  <button
                    onClick={() =>
                      downloadIcsFile(
                        `etut-${etut.subject}-${etut.date}`,
                        `[ETÜT] ${etut.subject}: ${etut.topic}`,
                        etut.notes || `${etut.location} yerinde etüt çalışması`,
                        `${etut.date}T${etut.time}:00`,
                        etut.duration,
                        etut.location
                      )
                    }
                    className="p-1.5 bg-surface-2 hover:bg-surface-3 text-fg-2 border border-line rounded-xl text-xs cursor-pointer transition-colors"
                    title="Takvim dosyası indir"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DEDICATED SIMPLE ETÜT DEVAMSIZLIK ARAYÜZÜ */}
      {viewMode === 'attendance' && (() => {
        const currentAttendanceEtut =
          etuts.find((e) => e.id === selectedAttendanceEtutId) || etuts[0] || null;

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
          setTimeout(() => setAttendanceFeedback(null), 2500);
        };

        const handleBulkEtutAttendance = (status: 'present' | 'absent' | 'excused') => {
          if (!currentAttendanceEtut || assignedStudents.length === 0) return;
          const map: Record<string, any> = {};
          assignedStudents.forEach((std) => {
            const note = attendanceNotes[std.id] || currentAttendanceEtut.studentAttendance?.[std.id]?.note || '';
            map[std.id] = {
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
          setTimeout(() => setAttendanceFeedback(null), 3000);
        };

        if (etuts.length === 0) {
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
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
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
                  {etuts.length} Planlı Etüt
                </span>
              </div>

              {/* AÇILIR MENÜ */}
              <div className="relative">
                <select
                  value={currentAttendanceEtut?.id || ''}
                  onChange={(e) => setSelectedAttendanceEtutId(e.target.value)}
                  className="w-full bg-canvas border-2 border-indigo-500/50 hover:border-indigo-400 rounded-xl px-4 py-3 text-sm font-bold text-fg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-inner"
                >
                  {etuts.map((e) => {
                    let formattedDate = e.date;
                    try {
                      const parts = (e.date || '').trim().split('T')[0].split('-');
                      if (parts.length === 3) formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                      else formattedDate = new Date(e.date).toLocaleDateString('tr-TR');
                    } catch {}
                    return (
                      <option key={e.id} value={e.id} className="bg-surface text-fg py-2">
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
                      <span>{new Date(currentAttendanceEtut.date).toLocaleDateString('tr-TR')} • {currentAttendanceEtut.time} ({currentAttendanceEtut.duration} dk)</span>
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

      {/* Etüt Analizi (yalnızca açıkken çizilir; her açılışta durum sıfırlanır) */}
      {isReportModalOpen && (
        <EtutAnalysisReportModal
          onClose={() => {
            setIsReportModalOpen(false);
            setReportSelectedStudentId(undefined);
          }}
          etuts={etuts}
          students={students}
          classes={classes}
          preselectedStudentId={reportSelectedStudentId}
          defaultScope={scopeFilter}
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

      {/* ETÜT OLUŞTUR / DÜZENLE */}
      <EtutFormModal
        open={!!etutForm}
        mode={etutForm?.mode || 'create'}
        source={etutForm?.source || null}
        initialDate={etutForm?.initialDate || null}
        students={students}
        classes={classes}
        etuts={etuts}
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
