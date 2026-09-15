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
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  UserCog,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student, Homework, HomeworkSubmission, Etut, GradeRecord, AttendanceRecord, StudentMessage, HomeworkResource } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForHomework, createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';
import { HomeworkResourceUploader } from '../Teacher/HomeworkResourceUploader';
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
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
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

  useEffect(() => {
    const updateUnread = () => {
      setUnreadNotifsCount(dataService.getUnreadNotificationsCount(currentStudent.id));
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
      {/* Top Navigation Wall for Student */}
      <div id="student-top-navigation-wall" className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-xl space-y-3.5">
        {/* Row 1: Moved and styled Action Buttons (Ödevlerim, Etütlerim, Soru Sayısı, Not-Devamsızlık) */}
        <div id="student-action-cards-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* 1. Ödevlerim */}
          <button
            id="student-nav-homework-card-btn"
            type="button"
            onClick={() => setActiveTab('homework')}
            className={`flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-indigo-900/60 to-indigo-800/40 hover:from-indigo-900/80 hover:to-indigo-800/60 border ${
              activeTab === 'homework' ? 'border-indigo-400 ring-2 ring-indigo-500/40 shadow-indigo-500/20' : 'border-indigo-500/30'
            } text-white font-bold text-xs transition-all shadow-lg hover:shadow-indigo-500/10 cursor-pointer group`}
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 group-hover:scale-110 transition-transform">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Ödevlerim</div>
                <div className="text-[10px] text-indigo-300 font-normal">
                  {myHomeworks.length} Ödev Atandı
                </div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* 2. Etütlerim */}
          <button
            id="student-nav-etuts-card-btn"
            type="button"
            onClick={() => setActiveTab('etuts')}
            className={`flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-cyan-900/50 to-blue-900/40 hover:from-cyan-900/70 hover:to-blue-900/60 border ${
              activeTab === 'etuts' ? 'border-cyan-400 ring-2 ring-cyan-500/40 shadow-cyan-500/20' : 'border-cyan-500/30'
            } text-white font-bold text-xs transition-all shadow-lg hover:shadow-cyan-500/10 cursor-pointer group`}
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-300 group-hover:scale-110 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Etütlerim</div>
                <div className="text-[10px] text-cyan-300 font-normal">
                  {myEtuts.length} Etüt Planlandı
                </div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* 3. Soru Sayısı */}
          <button
            id="student-nav-questions-card-btn"
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-purple-900/50 to-pink-900/40 hover:from-purple-900/70 hover:to-pink-900/60 border ${
              activeTab === 'questions' ? 'border-purple-400 ring-2 ring-purple-500/40 shadow-purple-500/20' : 'border-purple-500/30'
            } text-white font-bold text-xs transition-all shadow-lg hover:shadow-purple-500/10 cursor-pointer group`}
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-110 transition-transform">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Soru Sayısı</div>
                <div className="text-[10px] text-purple-300 font-normal">Günlük & Haftalık Takip</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* 4. Not-Devamsızlık */}
          <button
            id="student-nav-grades-card-btn"
            type="button"
            onClick={() => setActiveTab('grades')}
            className={`flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-emerald-900/50 to-teal-900/40 hover:from-emerald-900/70 hover:to-teal-900/60 border ${
              activeTab === 'grades' ? 'border-emerald-400 ring-2 ring-emerald-500/40 shadow-emerald-500/20' : 'border-emerald-500/30'
            } text-white font-bold text-xs transition-all shadow-lg hover:shadow-emerald-500/10 cursor-pointer group`}
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-300 group-hover:scale-110 transition-transform">
                <Award className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Not-Devamsızlık</div>
                <div className="text-[10px] text-emerald-300 font-normal">Sınavlar & Devamsızlık</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Row 2: Sol tarafta butonların altına yerleştirilen küçültülmüş Ana Sayfa ve Bildirimler butonları */}
        <div id="student-bottom-nav-row" className="flex items-center justify-between pt-1 border-t border-slate-800/80">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Küçültülmüş Ana Sayfa Butonu */}
            <button
              id="student-subnav-home-btn"
              type="button"
              onClick={() => setActiveTab('home')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-750 border border-slate-700/60'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Ana Sayfa</span>
            </button>

            {/* Küçültülmüş Bildirimler Butonu */}
            <button
              id="student-subnav-notifications-btn"
              type="button"
              onClick={() => setIsNotificationModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/60 transition-all cursor-pointer relative"
              title="Gelen Bildirimler ve E-Postalar"
            >
              <div className="relative">
                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white rounded-full text-[8px] font-black flex items-center justify-center ring-1 ring-slate-900 animate-bounce">
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
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'messages'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                  : 'bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-750 border border-slate-700/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>Öğretmene Soru Sor ({myMessages.length})</span>
            </button>
          </div>

          {/* Sınıf ve Öğrenci Bilgisi */}
          <div id="student-class-info-badge" className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 font-medium">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
              {currentStudent.className}
            </span>
            {currentStudent.studentNumber && <span>#{currentStudent.studentNumber}</span>}
          </div>
        </div>
      </div>

      {/* =========================================================================
          VIEW 1: HOME (ÖĞRETMEN ANA SAYFASININ ÖĞRENCİYE ÖZGÜ TAM KARŞILIĞI)
         ========================================================================= */}
      {activeTab === 'home' && (
        <div className="space-y-6 animate-in fade-in duration-200">
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

          {/* Unread Notifications / Email Alerts Banner */}
          {unreadNotifsCount > 0 && (
            <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/40 border border-indigo-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-100 shadow-lg">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-sm block text-white flex items-center space-x-2">
                    <span>📬 {unreadNotifsCount} Yeni Bildirim & E-Postanız Var</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">YENİ</span>
                  </span>
                  <span className="text-xs text-indigo-200/90">
                    Öğretmeniniz tarafından yeni ödev veya etüt tanımlandı. Detayları ve e-postayı görüntüleyebilirsiniz.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsNotificationModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
              >
                Bildirimleri & E-Postaları Gör
              </button>
            </div>
          )}

          {/* Upcoming Homeworks Urgency Banner */}
          {upcomingAlerts.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3 text-amber-200 animate-pulse">
              <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <span className="font-bold text-sm block text-amber-300">
                  ⏰ Yaklaşan Ödev Uyarısı ({upcomingAlerts.length} Ödev)
                </span>
                <span>
                  Son teslim tarihi yaklaşan ödevleriniz var: &quot;
                  {upcomingAlerts.map((h) => h.title).join(', ')}&quot;. Lütfen zamanında teslim etmeyi unutmayın!
                </span>
              </div>
            </div>
          )}

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

      {/* Sub-Pages Header Banner when NOT on Home */}
      {activeTab !== 'home' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-indigo-300 hover:text-white font-bold text-xs border border-slate-700 transition-colors cursor-pointer group shadow-sm"
              title="Öğrenci Ana Sayfasına Dön"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span>Ana Sayfaya Dön</span>
            </button>
            <div className="h-5 w-[1px] bg-slate-700 hidden sm:block" />
            <div>
              <h2 className="text-sm sm:text-base font-black text-white">
                {activeTab === 'homework' && 'Ödevlerim & Kazanımlarım'}
                {activeTab === 'etuts' && 'Etüt ve Birebir Ders Programım'}
                {activeTab === 'grades' && 'Akademik Notlarım ve Devamsızlık Durumum'}
                {activeTab === 'messages' && 'Öğretmenlerime Soru Sor ve Mesajlaşma'}
                {activeTab === 'questions' && 'Soru Sayısı Çalışma ve Takip Modülü'}
              </h2>
            </div>
          </div>
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
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                      title=".ics Takvim İndir"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
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
              <p className="text-xs text-slate-400 mt-1">
                Çözemediğiniz soruları, linkleri veya notları iletebilirsiniz. Mesajınızı sadece öğretmeniniz görebilir.
              </p>
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
            students={dataService.getStudents()}
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
        onClose={() => setIsPasswordModalOpen(false)}
        student={currentStudent}
      />
    </div>
  );
};
