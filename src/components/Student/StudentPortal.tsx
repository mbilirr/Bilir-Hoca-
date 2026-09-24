import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  Link as LinkIcon,
  MessageSquare,
  Send,
  Sparkles,
  UploadCloud,
  AlertTriangle,
  XCircle,
  Award,
  UserX,
  MapPin,
  Flame,
  Check,
  Paperclip,
  Bell,
  Mail,
  Camera,
  Home,
  ArrowRight,
  ChevronDown,
  UserCog,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student, Homework, HomeworkSubmission, Etut, GradeRecord, AttendanceRecord, StudentMessage, HomeworkResource, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForHomework, createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';
import { HomeworkResourceUploader } from '../Teacher/HomeworkResourceUploader';
import { WeeklyEtutCalendar } from '../Teacher/WeeklyEtutCalendar';
import { StudentNotificationCenterModal } from './StudentNotificationCenterModal';
import { StudentAvatarModal } from './StudentAvatarModal';
import { StudentHeroBanner, StudentTabType } from './StudentHeroBanner';
import { StudentStatsOverview } from './StudentStatsOverview';
import { StudentProfileEditModal, StudentPasswordModal } from './StudentProfileModals';
import { StudentQuestionModule } from './StudentQuestionModule';

interface StudentPortalProps {
  currentStudent: Student;
  homeworks: Homework[];
  etuts: Etut[];
  grades: GradeRecord[];
  attendance: AttendanceRecord[];
  messages: StudentMessage[];
  submissions?: HomeworkSubmission[];
}

export const StudentPortal: React.FC<StudentPortalProps> = ({
  currentStudent,
  homeworks,
  etuts,
  grades,
  attendance,
  messages,
  submissions: propSubmissions,
}) => {
  const [activeTab, setActiveTab] = useState<StudentTabType>('home');

  // Profile and Avatar Modals state
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const isMandatoryPasswordChange =
    Boolean(currentStudent.mustChangePassword || currentStudent.password === '54321');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(isMandatoryPasswordChange);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);

  // Submit modal state
  const [submittingHw, setSubmittingHw] = useState<Homework | null>(null);
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [submissionResources, setSubmissionResources] = useState<HomeworkResource[]>([]);

  // Send message form state
  const [messageSubject, setMessageSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageLink, setMessageLink] = useState('');
  const [messageSentFeedback, setMessageSentFeedback] = useState(false);

  // Notification center modal state
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [studentAvatar, setStudentAvatar] = useState<string>(currentStudent.avatar || '');
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(() =>
    dataService.getUnreadNotificationsCount(currentStudent.id)
  );
  const [classes, setClasses] = useState<ClassGroup[]>(() => dataService.getClasses());
  const [etutViewMode, setEtutViewMode] = useState<'calendar' | 'cards'>('calendar');
  const [notificationTrigger, setNotificationTrigger] = useState(0);

  const unreadPraiseNotifs = React.useMemo(() => {
    return dataService
      .getStudentNotifications(currentStudent.id)
      .filter((n) => n.type === 'praise' && !n.read);
  }, [currentStudent.id, unreadNotifsCount, notificationTrigger]);

  useEffect(() => {
    setActiveTab('home');
  }, [currentStudent.id]);

  useEffect(() => {
    const updateUnread = () => {
      setUnreadNotifsCount(dataService.getUnreadNotificationsCount(currentStudent.id));
      setClasses(dataService.getClasses());
      setNotificationTrigger((prev) => prev + 1);
    };
    updateUnread();
    const unsubscribe = dataService.subscribe(updateUnread);
    return () => unsubscribe();
  }, [currentStudent.id]);

  // Helper to get submissions safely
  const getSubmissionsList = () => propSubmissions || dataService.getSubmissions() || [];

  const getStudentSubmission = (hw: Homework) => {
    const list = getSubmissionsList();
    const fromList = list.find((s) => s.homeworkId === hw.id && s.studentId === currentStudent.id);
    if (fromList) return fromList;
    if (Array.isArray(hw.submissions)) {
      return hw.submissions.find((s) => s.studentId === currentStudent.id);
    }
    return undefined;
  };

  const getOutcomes = (hw: Homework): string[] => {
    if (Array.isArray(hw.outcomes) && hw.outcomes.length > 0) return hw.outcomes;
    if (Array.isArray(hw.learningOutcomes) && hw.learningOutcomes.length > 0) return hw.learningOutcomes;
    return [];
  };

  // Filter homeworks assigned to this student (or assigned to 'all' or class)
  const myHomeworks = homeworks.filter((h) => {
    if (h.assignedTo === 'all') return true;
    if (Array.isArray(h.assignedTo)) return h.assignedTo.includes(currentStudent.id);
    return false;
  });

  // Filter etuts assigned to this student (or assigned to 'all')
  const myEtuts = etuts.filter((e) => {
    if (e.assignedStudentIds === 'all') return true;
    if (Array.isArray(e.assignedStudentIds)) return e.assignedStudentIds.includes(currentStudent.id);
    return false;
  });

  // Filter student grades
  const myGrades = grades.filter((g) => g.studentId === currentStudent.id);

  // Calculate student attendance stats
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let excusedDays = 0;

  attendance.forEach((att) => {
    const record = att.records.find((r) => r.studentId === currentStudent.id);
    if (record) {
      if (record.status === 'present') presentDays++;
      else if (record.status === 'absent') absentDays++;
      else if (record.status === 'late') lateDays++;
      else if (record.status === 'excused') excusedDays++;
    }
  });

  // Filter messages sent by this student
  const myMessages = messages.filter((m) => m.studentId === currentStudent.id);

  // Upcoming notifications: Homeworks due within 48h and not submitted
  const now = new Date();
  const upcomingAlerts = myHomeworks.filter((hw) => {
    const sub = getStudentSubmission(hw);
    if (sub) return false; // already submitted
    const dueDate = new Date(hw.dueDate);
    const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 48;
  });

  // Handle Homework Submission
  const handleSubmitHomework = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingHw) return;

    dataService.submitHomework(
      submittingHw.id,
      currentStudent.id,
      submissionNotes.trim(),
      submissionLink.trim() || undefined,
      submissionResources.length > 0 ? submissionResources : undefined
    );

    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
    });

    setSubmittingHw(null);
    setSubmissionLink('');
    setSubmissionNotes('');
    setSubmissionResources([]);
  };

  // Handle Send Message to Teacher
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageSubject.trim() || !messageText.trim()) return;

    dataService.sendMessage({
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      studentClass: currentStudent.className,
      studentAvatar: currentStudent.avatar,
      subject: messageSubject.trim(),
      text: messageText.trim(),
      linkUrl: messageLink.trim() || undefined,
    });

    setMessageSubject('');
    setMessageText('');
    setMessageLink('');
    setMessageSentFeedback(true);
    setTimeout(() => setMessageSentFeedback(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Wall for Student (Google Looker Studio Education Style) */}
      <div id="student-top-navigation-wall" className="static lg:sticky lg:top-[4.25rem] z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3.5 shadow-sm space-y-3 transition-all">
        {/* Row 1: Action Buttons (Ödevlerim, Etütlerim, Soru Sayısı, Not-Devamsızlık) */}
        <div id="student-action-cards-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* 1. Ödevlerim */}
          <button
            id="student-nav-homework-card-btn"
            type="button"
            onClick={() => setActiveTab('homework')}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer group hover-glow-amber text-white shadow-sm ${
              activeTab === 'homework'
                ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 border-white ring-4 ring-amber-300/90 shadow-md scale-[1.01]'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-400/80 hover:from-amber-600 hover:to-orange-600'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs bg-white/20 text-white border border-white/30 backdrop-blur-xs"
              >
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <div className="text-xs sm:text-sm font-black text-white group-hover:text-amber-100 transition-colors drop-shadow-xs">
                  Ödevlerim
                </div>
              </div>
            </div>
            <ArrowRight
              className={`w-4 h-4 text-white group-hover:translate-x-1 transition-transform ${
                activeTab === 'homework' ? 'font-black' : 'opacity-90'
              }`}
            />
          </button>

          {/* 2. Etütlerim */}
          <button
            id="student-nav-etuts-card-btn"
            type="button"
            onClick={() => setActiveTab('etuts')}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer group hover-glow-blue text-white shadow-sm ${
              activeTab === 'etuts'
                ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 border-white ring-4 ring-blue-300/90 shadow-md scale-[1.01]'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-400/80 hover:from-blue-700 hover:to-indigo-700'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs bg-white/20 text-white border border-white/30 backdrop-blur-xs"
              >
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <div className="text-xs sm:text-sm font-black text-white group-hover:text-blue-100 transition-colors drop-shadow-xs">
                  Etütlerim
                </div>
              </div>
            </div>
            <ArrowRight
              className={`w-4 h-4 text-white group-hover:translate-x-1 transition-transform ${
                activeTab === 'etuts' ? 'font-black' : 'opacity-90'
              }`}
            />
          </button>

          {/* 3. Soru Sayısı */}
          <button
            id="student-nav-questions-card-btn"
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer group hover-glow-emerald text-white shadow-sm ${
              activeTab === 'questions'
                ? 'bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-600 border-white ring-4 ring-emerald-300/90 shadow-md scale-[1.01]'
                : 'bg-gradient-to-r from-emerald-600 to-emerald-700 border-emerald-400/80 hover:from-emerald-700 hover:to-teal-700'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs bg-white/20 text-white border border-white/30 backdrop-blur-xs"
              >
                <HelpCircle className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <div className="text-xs sm:text-sm font-black text-white group-hover:text-emerald-100 transition-colors drop-shadow-xs">
                  Soru Sayısı
                </div>
              </div>
            </div>
            <ArrowRight
              className={`w-4 h-4 text-white group-hover:translate-x-1 transition-transform ${
                activeTab === 'questions' ? 'font-black' : 'opacity-90'
              }`}
            />
          </button>

          {/* 4. Not-Devamsızlık */}
          <button
            id="student-nav-grades-card-btn"
            type="button"
            onClick={() => setActiveTab('grades')}
            className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer group hover-glow-purple text-white shadow-sm ${
              activeTab === 'grades'
                ? 'bg-gradient-to-r from-purple-600 via-purple-700 to-violet-600 border-white ring-4 ring-purple-300/90 shadow-md scale-[1.01]'
                : 'bg-gradient-to-r from-purple-600 to-purple-700 border-purple-400/80 hover:from-purple-700 hover:to-violet-700'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs bg-white/20 text-white border border-white/30 backdrop-blur-xs"
              >
                <Award className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <div className="text-xs sm:text-sm font-black text-white group-hover:text-purple-100 transition-colors drop-shadow-xs">
                  Not-Devamsızlık
                </div>
              </div>
            </div>
            <ArrowRight
              className={`w-4 h-4 text-white group-hover:translate-x-1 transition-transform ${
                activeTab === 'grades' ? 'font-black' : 'opacity-90'
              }`}
            />
          </button>
        </div>

        {/* Row 2: Sol tarafta butonların altına yerleştirilen küçültülmüş Ana Sayfa ve Bildirimler butonları */}
        <div id="student-bottom-nav-row" className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Küçültülmüş Ana Sayfa Butonu */}
            <button
              id="student-subnav-home-btn"
              type="button"
              onClick={() => setActiveTab('home')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-[#0f172a] text-white shadow-xs'
                  : 'bg-[#f1f5f9] text-[#334155] hover:text-[#0f172a] hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5 text-orange-400" />
              <span>Ana Sayfa</span>
            </button>

            {/* Küçültülmüş Bildirimler Butonu */}
            <button
              id="student-subnav-notifications-btn"
              type="button"
              onClick={() => setIsNotificationModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f1f5f9] hover:bg-slate-200 text-[#334155] hover:text-[#0f172a] border border-slate-200 transition-all cursor-pointer relative"
              title="Gelen Bildirimler ve E-Postalar"
            >
              <div className="relative">
                <Bell className="w-3.5 h-3.5 text-orange-500" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-orange-600 text-white rounded-full text-[8px] font-black flex items-center justify-center ring-1 ring-white animate-bounce">
                    {unreadNotifsCount}
                  </span>
                )}
              </div>
              <span>Bildirimler</span>
            </button>

            {/* Öğretmene Soru Sor Butonu */}
            <button
              id="student-subnav-messages-btn"
              type="button"
              onClick={() => setActiveTab('messages')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'messages'
                  ? 'bg-[#0f172a] text-white shadow-xs'
                  : 'bg-[#f1f5f9] text-[#334155] hover:text-[#0f172a] hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
              <span>Öğretmene Soru Sor ({myMessages.length})</span>
            </button>
          </div>

          {/* Sınıf ve Öğrenci Bilgisi */}
          <div id="student-class-info-badge" className="hidden sm:flex items-center space-x-2 text-xs text-slate-500 font-medium">
            <span className="px-2.5 py-1 rounded-lg bg-[#f1f5f9] border border-slate-200 text-[#0f172a] font-bold">
              {currentStudent.className}
            </span>
            {currentStudent.studentNumber && <span className="font-semibold text-slate-500">#{currentStudent.studentNumber}</span>}
          </div>
        </div>
      </div>

      {/* =========================================================================
          VIEW 1: HOME (ÖĞRETMEN ANA SAYFASININ ÖĞRENCİYE ÖZGÜ TAM KARŞILIĞI)
         ========================================================================= */}
      {activeTab === 'home' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Öğretmenden Gelen Günlük Soru Çözüm Tebrik ve Aferin Bildirim Kartı */}
          {unreadPraiseNotifs.length > 0 && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-5 sm:p-6 text-white shadow-xl shadow-amber-500/25 border-2 border-amber-300/50 animate-in fade-in slide-in-from-top-4 duration-300">
              {/* Arka plan ışıltı ve süslemeler */}
              <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
              <div className="absolute right-12 top-2 text-6xl opacity-15 select-none pointer-events-none">
                🏆
              </div>

              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shrink-0 text-2xl sm:text-3xl shadow-inner">
                    ⭐
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white text-amber-900 uppercase tracking-wider shadow-xs">
                        🎉 TEBRİKLER & AFERİN!
                      </span>
                      <span className="text-xs text-amber-100 font-bold">
                        {unreadPraiseNotifs[0].teacherName ? `Öğretmeniniz: ${unreadPraiseNotifs[0].teacherName}` : 'Öğretmeninizden'}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-black text-white mt-1">
                      {unreadPraiseNotifs[0].title}
                    </h3>

                    <p className="text-xs sm:text-sm text-amber-50 mt-1.5 font-medium bg-black/15 backdrop-blur-xs p-3 rounded-xl border border-white/15 leading-relaxed">
                      "{unreadPraiseNotifs[0].message}"
                    </p>

                    <div className="text-[11px] text-amber-100/90 mt-2 flex items-center space-x-3">
                      <span>🎯 {unreadPraiseNotifs[0].sourceTitle || 'Günlük Soru Çözüm Başarısı'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
                      dataService.markNotificationAsRead(unreadPraiseNotifs[0].id);
                      setNotificationTrigger((prev) => prev + 1);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 font-black text-xs shadow-md transition-all hover:scale-105 active:scale-95 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <span>Teşekkürler! (Okundu Yap) 👏</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Wall 1: Öğrenci Karşılama ve Güncel Ayı Gösteren İnteraktif Ajanda Duvarı */}
          <StudentHeroBanner
            student={{ ...currentStudent, avatar: studentAvatar || currentStudent.avatar }}
            homeworks={myHomeworks}
            etuts={myEtuts}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
            onOpenProfileModal={() => setIsProfileModalOpen(true)}
            onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
          />

          {/* Wall 2: Öğrenci Durum Özetleri, İstatistikler, Rozetler ve Hızlı Geçiş Duvarı */}
          <StudentStatsOverview
            student={currentStudent}
            homeworks={myHomeworks}
            submissions={getSubmissionsList()}
            etuts={myEtuts}
            grades={grades}
            attendance={attendance}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        </div>
      )}

      {/* TAB 1: HOMEWORKS */}
      {activeTab === 'homework' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {myHomeworks.map((hw) => {
              const statusInfo = dataService.getStudentHomeworkStatus(hw.id, currentStudent.id);
              const mySubmission = getStudentSubmission(hw);
              const outcomes = getOutcomes(hw);

              return (
                <div
                  key={hw.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg relative"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {hw.subject}
                      </span>

                      {/* Status Emoji Badge */}
                      <span
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold border ${statusInfo.badgeClass}`}
                      >
                        <span>{statusInfo.emoji}</span>
                        <span>{statusInfo.label}</span>
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white mb-2">{hw.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-3 mb-4 leading-relaxed">
                      {hw.description}
                    </p>

                    {/* Resources (Video, Link, PDF) from Teacher */}
                    {((hw.resources && hw.resources.length > 0) || hw.attachmentUrl) && (
                      <div className="mb-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1.5">
                          📎 Ödev Materyalleri & Kaynaklar
                        </span>
                        <HomeworkResourceViewer
                          resources={hw.resources}
                          legacyAttachmentUrl={hw.attachmentUrl}
                        />
                      </div>
                    )}

                    {/* Learning Outcomes (Kazanımlar) */}
                    {outcomes.length > 0 && (
                      <div className="mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1.5">
                          🎯 İlgili Kazanımlar
                        </span>
                        <ul className="space-y-1">
                          {outcomes.map((outcome, idx) => (
                            <li
                              key={idx}
                              className="text-xs text-slate-300 flex items-center space-x-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                              <span className="truncate">{outcome}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Due Date & Submission Info */}
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          Son Teslim:{' '}
                          <strong className="text-slate-200 font-medium">
                            {new Date(hw.dueDate).toLocaleDateString('tr-TR')}
                          </strong>
                        </span>
                      </div>

                      {mySubmission?.submittedAt && (
                        <div className="text-right text-[11px] text-slate-500">
                          Teslim: {new Date(mySubmission.submittedAt).toLocaleDateString('tr-TR')}
                        </div>
                      )}
                    </div>

                    {/* Student's own submitted resources */}
                    {mySubmission?.resources && mySubmission.resources.length > 0 && (
                      <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl mb-4 text-xs">
                        <span className="text-[10px] font-bold text-indigo-300 uppercase block mb-1">
                          📤 Gönderdiğiniz Çözüm Materyalleri:
                        </span>
                        <HomeworkResourceViewer resources={mySubmission.resources} isCompact />
                      </div>
                    )}

                    {/* Teacher Feedback / Grade if available */}
                    {mySubmission?.score !== undefined && mySubmission.score !== null && (
                      <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl mb-4 text-xs">
                        <div className="flex items-center justify-between font-bold text-emerald-300 mb-1">
                          <span>Öğretmen Değerlendirmesi:</span>
                          <span className="text-sm font-extrabold">{mySubmission.score} / 100</span>
                        </div>
                        {mySubmission.feedback && (
                          <p className="text-slate-300 italic">{mySubmission.feedback}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                    <button
                      onClick={() => setSubmittingHw(hw)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                        mySubmission
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                      }`}
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>{mySubmission ? 'Teslimi Güncelle' : 'Ödevi Teslim Et'}</span>
                    </button>

                    <a
                      href={createGoogleCalendarUrlForHomework(hw)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs transition-all"
                      title="Google Takvime Ekle"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" />
                    </a>

                    <button
                      onClick={() =>
                        downloadIcsFile(
                          `odev-${hw.id}`,
                          `[ÖDEV] ${hw.subject}: ${hw.title}`,
                          `${hw.description}\nKazanımlar:\n${outcomes.join('\n')}`,
                          `${hw.dueDate}T18:00:00`,
                          60
                        )
                      }
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                      title=".ics Takvim İndir"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ETUTS */}
      {activeTab === 'etuts' && (
        <div className="space-y-4">
          {/* Header & View Mode Switcher */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <span>Etütlerim & Çalışma Programım</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Size tanımlanmış haftalık etütleri inceleyebilir, takviminize ekleyebilirsiniz.
              </p>
            </div>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => setEtutViewMode('calendar')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  etutViewMode === 'calendar'
                    ? 'bg-indigo-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Haftalık Takvim
              </button>
              <button
                type="button"
                onClick={() => setEtutViewMode('cards')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  etutViewMode === 'cards'
                    ? 'bg-indigo-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Kart Görünümü ({myEtuts.length})
              </button>
            </div>
          </div>

          {etutViewMode === 'calendar' ? (
            <WeeklyEtutCalendar
              etuts={myEtuts}
              students={[currentStudent]}
              classes={classes}
              readOnly={true}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myEtuts.length === 0 ? (
                <div className="col-span-full p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400">
                  Şu anda adınıza atanmış bir etüt bulunmuyor.
                </div>
              ) : (
                myEtuts.map((etut) => (
                  <div
                    key={etut.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {etut.subject}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {etut.duration} Dakika
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white mb-2">{etut.topic}</h3>

                      <div className="space-y-2 text-xs text-slate-300 mb-4 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {new Date(etut.date).toLocaleDateString('tr-TR')} • {etut.time}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-3.5 h-3.5 text-rose-400" />
                          <span>{etut.location}</span>
                        </div>
                        {etut.notes && (
                          <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800">
                            {etut.notes}
                          </p>
                        )}
                        {etut.teacherFeedback && (
                          <div className="pt-2 border-t border-slate-800/80 text-xs text-amber-200">
                            <strong className="text-amber-300 font-semibold block text-[11px]">💬 Öğretmen Görüş ve Değerlendirmesi:</strong>
                            <p className="italic text-slate-200 mt-0.5">"{etut.teacherFeedback}"</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                      <a
                        href={createGoogleCalendarUrlForEtut(etut)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold transition-all"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                        <span>Google Takvime Ekle</span>
                      </a>

                      <button
                        onClick={() =>
                          downloadIcsFile(
                            `etut-${etut.id}`,
                            `[ETÜT] ${etut.subject}: ${etut.topic}`,
                            etut.notes || `${etut.location} dersliği`,
                            `${etut.date}T${etut.time}:00`,
                            etut.duration,
                            etut.location
                          )
                        }
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs cursor-pointer"
                        title=".ics Takvim İndir"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GRADES & ATTENDANCE */}
      {activeTab === 'grades' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs text-slate-400">Katılım Durumu</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{presentDays} Gün Var</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs text-slate-400">Devamsızlık (Yok)</span>
              <div className="text-2xl font-bold text-rose-400 mt-1">{absentDays} Gün</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs text-slate-400">Geç Kalma</span>
              <div className="text-2xl font-bold text-amber-400 mt-1">{lateDays} Gün</div>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-xs text-slate-400">İzinli / Raporlu</span>
              <div className="text-2xl font-bold text-blue-400 mt-1">{excusedDays} Gün</div>
            </div>
          </div>

          {/* Grades Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 font-bold text-white flex items-center space-x-2">
              <Award className="w-4 h-4 text-indigo-400" />
              <span>Ders Notlarım & Sınav Sonuçları</span>
            </div>
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Ders</th>
                  <th className="px-6 py-3.5 font-semibold">Sınav / Değerlendirme</th>
                  <th className="px-6 py-3.5 font-semibold">Puan</th>
                  <th className="px-6 py-3.5 font-semibold">Tarih</th>
                  <th className="px-6 py-3.5 font-semibold">Öğretmen Notu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {myGrades.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      Henüz girilmiş bir sınav veya performans notunuz bulunmamaktadır.
                    </td>
                  </tr>
                ) : (
                  myGrades.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-semibold text-white">{g.subject}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {g.examType}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold">
                        <span
                          className={
                            g.score >= 85
                              ? 'text-emerald-400'
                              : g.score >= 70
                              ? 'text-blue-400'
                              : 'text-amber-400'
                          }
                        >
                          {g.score}
                        </span>
                        <span className="text-slate-500 text-xs font-normal"> / {g.maxScore}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">{g.date}</td>
                      <td className="px-6 py-4 text-xs text-slate-300 italic">{g.remarks || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MESSAGES */}
      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Send Form */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                <span>Öğretmene Soru / Mesaj İlet</span>
              </h3>
            </div>

            {messageSentFeedback && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Mesajınız başarıyla öğretmene iletildi!</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Konu / Ders Başlığı *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Limit ve Süreklilik Soru 4 Çözümü"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Soru / Mesaj Açıklaması *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Hocam, türevin geometrik yorumunda bu adımda takıldım..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Soru Linki / Görsel Bağlantısı (İsteğe bağlı)
                </label>
                <div className="relative">
                  <LinkIcon className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    placeholder="https://drive.google.com/... veya resim linki"
                    value={messageLink}
                    onChange={(e) => setMessageLink(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Öğretmene İlet</span>
              </button>
            </form>
          </div>

          {/* Past Messages List */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white">Geçmiş Sorularım & Yanıtlar</h3>

            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {myMessages.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  Henüz öğretmene ilettiğiniz bir soru veya mesaj bulunmuyor.
                </p>
              ) : (
                myMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-2xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{msg.subject}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(msg.createdAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{msg.text}</p>

                    {msg.linkUrl && (
                      <a
                        href={msg.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-indigo-400 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Eklenen Bağlantı</span>
                      </a>
                    )}

                    {/* Teacher Reply */}
                    {msg.teacherReply ? (
                      <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-1">
                        <span className="text-[10px] font-bold text-emerald-400 block">
                          ✓ Öğretmeninizin Yanıtı:
                        </span>
                        <p className="text-xs text-slate-200">{msg.teacherReply}</p>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-400/80 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>Öğretmenin yanıtı bekleniyor...</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 6: QUESTIONS (ÖĞRENCİ SORU SAYISI KAYIT VE ANALİZ MODÜLÜ)
         ========================================================================= */}
      {activeTab === 'questions' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <StudentQuestionModule
            currentStudent={currentStudent}
            classes={dataService.getClasses()}
            students={[currentStudent]}
          />
        </div>
      )}

      {/* SUBMISSION MODAL */}
      {submittingHw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-2">Ödevi Teslim Et</h3>
            <p className="text-xs text-slate-400 mb-4">
              &quot;<strong>{submittingHw.title}</strong>&quot; adlı ödevinizi çözüm PDF'i, çözüm videosu, bağlantı veya açıklama ile
              öğretmeninize iletin.
            </p>

            <form onSubmit={handleSubmitHomework} className="space-y-4">
              {/* Solution Materials: PDF, Video, Link */}
              <HomeworkResourceUploader
                resources={submissionResources}
                onChange={setSubmissionResources}
              />

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Öğrenci Açıklaması / Çözüm Notu
                </label>
                <textarea
                  rows={3}
                  placeholder="Tüm sorular çözüldü, çözümler ekteki PDF dosyasındadır..."
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittingHw(null);
                    setSubmissionResources([]);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Teslim Et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Notification Center & Received Emails Modal */}
      <StudentNotificationCenterModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        currentStudent={currentStudent}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* Student Profile Photo / Avatar Modal */}
      <StudentAvatarModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        student={currentStudent}
        onAvatarUpdated={(newAvatar) => setStudentAvatar(newAvatar)}
      />

      {/* Student Profile Information Edit Modal */}
      <StudentProfileEditModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        student={currentStudent}
      />

      {/* Student Password Change Modal */}
      <StudentPasswordModal
        isOpen={isPasswordModalOpen}
        isMandatory={isMandatoryPasswordChange}
        onClose={() => setIsPasswordModalOpen(false)}
        student={currentStudent}
      />
    </div>
  );
};
