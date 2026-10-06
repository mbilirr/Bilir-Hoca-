import React, { useState, useEffect, useRef, Suspense } from 'react';
import { GraduationCap, Bell, ArrowLeft, Eye, ShieldCheck } from 'lucide-react';
import { PageHeader } from './components/ui/kit';
import { Navbar } from './components/Navbar';
import { CommandPalette } from './components/Layout/CommandPalette';
import { TeacherBottomNav } from './components/Layout/BottomNav';
import { findTeacherNav } from './components/Layout/navItems';
import { AuthPortal } from './components/Auth/AuthPortal';
import { PasswordRecoveryModal } from './components/Auth/PasswordRecoveryModal';
import { AdminTeacherApprovalBanner } from './components/Teacher/AdminTeacherApprovalBanner';
import { AdminBackupReminder } from './components/Admin/AdminBackupReminder';
import { TeacherApprovalModal } from './components/Teacher/TeacherApprovalModal';
import { SupabaseGuideModal } from './components/SupabaseGuideModal';
import { ModuleErrorBoundary } from './components/Common/ModuleErrorBoundary';
import { NetworkSyncStatusBanner } from './components/Common/NetworkSyncStatusBanner';
import { dataService } from './services/dataService';
import { lazyNamed, PageLoading } from './lib/lazyLoad';
import { supabase } from './lib/supabase';
import {
  Student,
  Teacher,
  AuthSession,
  ClassGroup,
  Homework,
  HomeworkSubmission,
  Etut,
  GradeRecord,
  AttendanceRecord,
  StudentMessage,
  UserRole,
  TeacherDocument,
  TeacherTabType,
  StudentQuestionLog,
} from './types';

// Aşama 15: sayfalar ilk açıldıklarında yüklenir (giriş ekranı ve öğrenci telefonu hızlı açılır)
const StudentManagement = lazyNamed(() => import('./components/Teacher/StudentManagement'), 'StudentManagement');
const HomeworkManagement = lazyNamed(() => import('./components/Teacher/HomeworkManagement'), 'HomeworkManagement');
const EtutManagement = lazyNamed(() => import('./components/Teacher/EtutManagement'), 'EtutManagement');
const TeacherMessages = lazyNamed(() => import('./components/Teacher/TeacherMessages'), 'TeacherMessages');
const TeacherHome = lazyNamed(() => import('./components/Teacher/TeacherHome'), 'TeacherHome');
const TeacherDocumentsArchive = lazyNamed(() => import('./components/Teacher/Documents/TeacherDocumentsArchive'), 'TeacherDocumentsArchive');
const KurumManagement = lazyNamed(() => import('./components/Admin/KurumManagement'), 'KurumManagement');
const GradeAttendance = lazyNamed(() => import('./components/Teacher/GradeAttendance'), 'GradeAttendance');
const QuestionTrackingView = lazyNamed(() => import('./components/Teacher/QuestionTrackingView'), 'QuestionTrackingView');
const AdminMaintenancePanel = lazyNamed(() => import('./components/Admin/AdminMaintenancePanel'), 'AdminMaintenancePanel');
const AdminUserManagement = lazyNamed(() => import('./components/Admin/AdminUserManagement'), 'AdminUserManagement');
const StudentPortal = lazyNamed(() => import('./components/Student/StudentPortal'), 'StudentPortal');

// URL hash'inden ('#/teacher/etuts' gibi) aktif rol ve sekme bilgisini oku.
// Component dışında tanımlı, her render'da yeniden oluşturulmaz.
function parseRouteHash(): { role: UserRole | null; tab: TeacherTabType } {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const hRole = parts[0] === 'student' ? 'student' : parts[0] === 'teacher' ? 'teacher' : null;
  const hTab = parts[1];
  return {
    role: hRole,
    tab: hRole === 'teacher' && hTab ? (hTab as TeacherTabType) : 'home',
  };
}

export default function App() {
  // Authentication session gatekeeper (null = show AuthPortal before app opens)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    dataService.getAuthSession()
  );

  // Active view role ('teacher' or 'student') — sayfa yenilenirse önce URL hash'ine bakılır
  const [role, setRole] = useState<UserRole>(() => {
    const fromHash = parseRouteHash();
    if (fromHash.role) return fromHash.role;
    const saved = dataService.getAuthSession();
    return saved?.role === 'student' ? 'student' : 'teacher';
  });

  const [currentStudent, setCurrentStudent] = useState<Student | null>(() => {
    const saved = dataService.getAuthSession();
    if (saved?.role === 'student') {
      return saved.user as Student;
    }
    return null;
  });

  const currentTeacher = authSession?.role === 'teacher' ? (authSession.user as Teacher) : null;

  // Modals
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isAdminApprovalModalOpen, setIsAdminApprovalModalOpen] = useState(false);

  // Teacher active navigation tab — sayfa yenilenirse URL hash'inden geri yüklenir, yoksa 'home'
  const [teacherTab, setTeacherTab] = useState<TeacherTabType>(() => parseRouteHash().tab);

  // Data states from dataService
  const [students, setStudents] = useState<Student[]>(dataService.getStudents());
  const [classes, setClasses] = useState<ClassGroup[]>(dataService.getClasses());
  const [homeworks, setHomeworks] = useState<Homework[]>(dataService.getHomeworks());
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>(dataService.getSubmissions());
  const [etuts, setEtuts] = useState<Etut[]>(dataService.getEtuts());
  const [grades, setGrades] = useState<GradeRecord[]>(dataService.getGrades());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(dataService.getAttendance());
  const [messages, setMessages] = useState<StudentMessage[]>(dataService.getMessages());
  const [documents, setDocuments] = useState<TeacherDocument[]>(dataService.getTeacherDocuments());
  const [questionLogs, setQuestionLogs] = useState<StudentQuestionLog[]>(dataService.getQuestionLogs());
  const [pendingApplications, setPendingApplications] = useState<number>(dataService.getPendingApplicationCount());

  // Subscribe to state changes in dataService and ensure initial remote sync
  useEffect(() => {
    // Initial mount sync across all devices
    dataService.setupAllRealtimeSync();
    dataService.revalidateAndSyncAll(true);

    const unsubscribe = dataService.subscribe(() => {
      setStudents(dataService.getStudents());
      setClasses(dataService.getClasses());
      setHomeworks(dataService.getHomeworks());
      setSubmissions(dataService.getSubmissions());
      setEtuts(dataService.getEtuts());
      setGrades(dataService.getGrades());
      setAttendance(dataService.getAttendance());
      setMessages(dataService.getMessages());
      setDocuments(dataService.getTeacherDocuments());
      setQuestionLogs(dataService.getQuestionLogs());
      setPendingApplications(dataService.getPendingApplicationCount());

      const activeSession = dataService.getAuthSession();
      setAuthSession(activeSession);
      if (activeSession?.role === 'student') {
        setCurrentStudent(activeSession.user as Student);
        setRole('student');
      }
    });

    return () => unsubscribe();
  }, []);

  // role/teacherTab her değiştiğinde URL hash'ine yaz (geri tuşu için geçmiş kaydı oluşturur,
  // sayfa yenilenince de aynı sekmede kalınmasını sağlar)
  useEffect(() => {
    if (!authSession) return;
    const hash = `#/${role}${role === 'teacher' ? '/' + teacherTab : ''}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
  }, [role, teacherTab, authSession]);

  // Tarayıcıda geri/ileri tuşuna basıldığında hash'ten state'i geri yükle
  useEffect(() => {
    const handlePopState = () => {
      const { role: hRole, tab } = parseRouteHash();
      if (hRole) setRole(hRole);
      setTeacherTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Açılışta: uygulama oturumu var ama Supabase oturumu yoksa (süresi dolmuş vb.) çıkış yap,
  // böylece kullanıcı yetkisiz (anon) istek atan "hayalet" bir oturumda kalmaz.
  useEffect(() => {
    if (!dataService.getAuthSession()) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session) {
        dataService.logout();
        setAuthSession(null);
        setCurrentStudent(null);
        setRole('teacher');
        setTeacherTab('home');
      }
    });
  }, []);

  const lastActivityRef = useRef<number>(Date.now());

  // 5 Dakika Kullanılmadığında Oturumu Otomatik Sonlandırma
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('edu_sys_last_activity_ts');
      if (stored) {
        const num = parseInt(stored, 10);
        if (!isNaN(num) && num > 0) {
          lastActivityRef.current = num;
        }
      }
    } catch {}

    let lastMarkTime = 0;
    const markActivity = () => {
      const now = Date.now();
      // Throttle event updates to every 2.5 seconds for performance
      if (now - lastMarkTime > 2500) {
        lastMarkTime = now;
        lastActivityRef.current = now;
        try {
          sessionStorage.setItem('edu_sys_last_activity_ts', String(now));
        } catch {}
      }
    };

    const performInactivityCheck = () => {
      const activeSession = dataService.getAuthSession();
      if (activeSession) {
        const now = Date.now();
        const diff = now - lastActivityRef.current;
        // 5 dakika = 5 * 60 * 1000 = 300,000 ms
        if (diff >= 5 * 60 * 1000) {
          dataService.logout();
          setAuthSession(null);
          setCurrentStudent(null);
          setRole('teacher');
          setTeacherTab('home');
        }
      }
    };

    // İlk açılışta hemen kontrol et
    performInactivityCheck();

    const trackedEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    trackedEvents.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));

    // Kullanıcı sekmeden ayrılıp geri geldiğinde veya telefon ekranı açıldığında anında kontrol et ve senkronize et
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performInactivityCheck();
        dataService.reconnectAllRealtime();
      }
    };
    const handleFocus = () => {
      performInactivityCheck();
      dataService.reconnectAllRealtime();
    };
    const handleOnline = () => {
      dataService.reconnectAllRealtime();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    const inactivityInterval = setInterval(performInactivityCheck, 3000);

    return () => {
      trackedEvents.forEach((evt) => window.removeEventListener(evt, markActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      clearInterval(inactivityInterval);
    };
  }, []);

  // Handle successful login or registration from AuthPortal
  const handleAuthSuccess = async (session: AuthSession) => {
    setAuthSession(session);
    setTeacherTab('home');

    // Oturum açan kullanıcının (Yönetici / İzinli Öğretmen / Öğrenci) yetkilerine göre verileri anında filtrele ve yenile
    const freshStudents = dataService.getStudents();
    const freshClasses = dataService.getClasses();
    setStudents(freshStudents);
    setClasses(freshClasses);
    setHomeworks(dataService.getHomeworks());
    setEtuts(dataService.getEtuts());

    if (session.role === 'teacher') {
      setRole('teacher');
      if (freshStudents.length > 0) {
        setCurrentStudent(freshStudents[0]);
      }
    } else {
      setRole('student');
      setCurrentStudent(session.user as Student);
    }

    // Bilgisayar, tablet ve telefon arasında tek doğruluk kaynağı (Single Source of Truth):
    // Tüm kayıtları (ödevler, yoklama, notlar, etütler, sınıflar, öğrenciler, mesajlar, dökümanlar) buluttan çek
    try {
      await dataService.revalidateAndSyncAll(false);
      setStudents(dataService.getStudents());
      setClasses(dataService.getClasses());
      setHomeworks(dataService.getHomeworks());
      setSubmissions(dataService.getSubmissions());
      setEtuts(dataService.getEtuts());
      setGrades(dataService.getGrades());
      setAttendance(dataService.getAttendance());
      setMessages(dataService.getMessages());
      setDocuments(dataService.getTeacherDocuments());
    } catch {}
  };

  const handleRoleChange = (newRole: UserRole) => {
    // If student is logged in, they CANNOT switch to teacher
    if (authSession?.role === 'student' && newRole === 'teacher') {
      return;
    }

    if (newRole === 'student') {
      if (!currentStudent && students.length > 0) {
        setCurrentStudent(students[0]);
      }
      setRole('student');
    } else {
      setRole('teacher');
      setTeacherTab('home');
    }
  };

  // Logout handler (returns to AuthPortal entrance and resets to home)
  const handleLogout = () => {
    dataService.logout();
    setAuthSession(null);
    setCurrentStudent(null);
    setRole('teacher');
    setTeacherTab('home');
  };

  const unreadMessagesCount = messages.filter((m) => !m.read).length;

  // ================= GATEKEEPER CHECK =================
  // If not authenticated, render the initial entrance login/register portal before the app opens
  if (!authSession) {
    return (
      <div className="relative min-h-screen">
        <NetworkSyncStatusBanner />
        <PasswordRecoveryModal />
        <AuthPortal
          onAuthSuccess={handleAuthSuccess}
          classes={classes}
          students={students}
          teachers={dataService.getTeachers()}
        />
      </div>
    );
  }

  // Determine active teacher info if logged in as teacher
  const activeTeacher =
    authSession.role === 'teacher' ? (authSession.user as Teacher) : null;
  const isAdminTeacher = !!activeTeacher && dataService.isTeacherAdmin(activeTeacher);
  const showTeacherChrome = !!activeTeacher && role === 'teacher';

  // Üst menü, alt menü ve hızlı aramadan bölüm değiştirme
  const selectTeacherTab = (tab: TeacherTabType) => {
    setRole('teacher');
    setTeacherTab(tab);
    setStudents(dataService.getStudents());
    setClasses(dataService.getClasses());
    setHomeworks(dataService.getHomeworks());
    setEtuts(dataService.getEtuts());
  };

  return (
    <div
      className={`min-h-screen text-fg flex flex-col overflow-x-hidden w-full max-w-full ${showTeacherChrome || (role === 'student' && currentStudent) ? 'has-bottom-nav' : ''}`}
    >
      <NetworkSyncStatusBanner />
      {/* Top Main Navbar */}
      <Navbar
        role={role}
        authSession={authSession}
        onRoleChange={handleRoleChange}
        onOpenSupabaseGuide={() => setIsSupabaseModalOpen(true)}
        currentStudent={currentStudent}
        onLogout={handleLogout}
        onStudentLogout={handleLogout}
        activeTeacherTab={role === 'teacher' ? teacherTab : undefined}
        onSelectTeacherTab={selectTeacherTab}
        unreadMessagesCount={unreadMessagesCount}
        documentsCount={documents.length}
      />

      {/* Teacher Viewing Student Portal Notice Banner */}
      {authSession.role === 'teacher' && role === 'student' && (
        <div className="bg-warning-soft border-b border-line px-3 sm:px-6 lg:px-8 py-2.5 text-xs text-warning-fg">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 shrink-0" />
              <span>
                <strong>Öğrenci görünümü:</strong> Öğrencilerin gördüğü ekranı inceliyorsunuz.
              </span>
            </div>
            <button
              onClick={() => {
                setRole('teacher');
                setTeacherTab('home');
              }}
              className="ui-btn ui-btn-warning ui-btn-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Öğretmen Paneline Dön</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {role === 'teacher' ? (
          /* ================= TEACHER DASHBOARD ================= */
          <div className="space-y-6">
            {/* Kurum Yöneticisi Admin Onay Bildirimi Duvarı */}
            {(activeTeacher?.isAdmin || currentTeacher?.isAdmin) && dataService.isHeadAdmin() && (
              <AdminTeacherApprovalBanner
                onOpenFullModal={() => setIsAdminApprovalModalOpen(true)}
              />
            )}

            {/* Yönetici: veri yedeği hatırlatması (son yedek 7 günden eskiyse) */}
            {activeTeacher?.isAdmin && dataService.isHeadAdmin() && teacherTab !== 'user_management' && (
              <AdminBackupReminder onOpenBackup={() => setTeacherTab('user_management')} />
            )}

            {/* Yönetici: bekleyen öğrenci kayıt başvuruları */}
            {activeTeacher?.isAdmin && dataService.isHeadAdmin() && pendingApplications > 0 && teacherTab !== 'user_management' && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-warning-soft border border-line text-fg">
                <div className="flex items-center gap-2.5 text-sm">
                  <Bell className="w-4 h-4 text-warning-fg shrink-0" />
                  <span>
                    <strong>{pendingApplications}</strong> öğrenci kayıt başvurusu onayınızı bekliyor.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTeacherTab('user_management')}
                  className="ui-btn ui-btn-warning ui-btn-sm"
                >
                  Başvuruları İncele
                </button>
              </div>
            )}

            {/* ANA SAYFA: selamlama, "Bugün" özeti, özet kartları ve ajanda */}
            {teacherTab === 'home' && (
              <Suspense fallback={<PageLoading />}>
              <TeacherHome
                currentTeacher={currentTeacher}
                students={students}
                classes={classes}
                homeworks={homeworks}
                submissions={submissions}
                etuts={etuts}
                messages={messages}
                onNavigateTab={selectTeacherTab}
                onOpenStudentView={() => handleRoleChange('student')}
              />
              </Suspense>
            )}

            {/* SEÇİLİ ÇALIŞMA MODÜLÜ: Çalışma modülü butonundan hangi bölüm seçildiyse sayfada SADECE o bölüm gözükür */}
            {teacherTab !== 'home' && (
              <div className="space-y-4">
                {/* Active Teacher View Tab with Isolated Safe Boundary */}
                <ModuleErrorBoundary
                  key={teacherTab}
                  moduleName={findTeacherNav(teacherTab)?.title || 'Modül'}
                  onResetToHome={() => setTeacherTab('home')}
                >
                  {!dataService.canUseTab(teacherTab) ? (
                    <div className="ui-card p-8 text-center space-y-3 max-w-xl mx-auto" id="module-locked">
                      <ShieldCheck className="w-8 h-8 mx-auto text-warning-fg" />
                      <h2 className="text-lg font-bold text-fg">Bu bölüm kurumunuz için kapalı</h2>
                      <p className="text-sm text-muted">
                        "{findTeacherNav(teacherTab)?.title || 'Bu bölüm'}" bölümünü kullanma izni genel yönetici tarafından verilmemiş.
                      </p>
                      <button type="button" onClick={() => setTeacherTab('home')} className="ui-btn ui-btn-secondary">
                        Ana sayfaya dön
                      </button>
                    </div>
                  ) : (
                  <Suspense fallback={<PageLoading />}>
                  {teacherTab === 'students' && (
                    <StudentManagement
                      students={students}
                      classes={classes}
                      onSelectStudentForHomework={() => {
                        setTeacherTab('homework');
                      }}
                    />
                  )}

                  {teacherTab === 'homework' && (
                    <HomeworkManagement
                      homeworks={homeworks}
                      submissions={submissions}
                      students={students}
                      classes={classes}
                      onNavigateToEtut={() => setTeacherTab('etuts')}
                    />
                  )}

                  {teacherTab === 'etuts' && (
                    <EtutManagement
                      etuts={etuts}
                      students={students}
                      classes={classes}
                    />
                  )}

                  {teacherTab === 'messages' && (
                    <TeacherMessages messages={messages} />
                  )}

                  {teacherTab === 'archive' && (
                    <TeacherDocumentsArchive
                      documents={documents}
                      onDocumentsChange={() => setDocuments(dataService.getTeacherDocuments())}
                    />
                  )}

                  {teacherTab === 'grades' && (
                    <GradeAttendance students={students} classes={classes} grades={grades} attendance={attendance} />
                  )}

                  {teacherTab === 'question_tracking' && (
                    <QuestionTrackingView
                      classes={classes}
                      students={students}
                    />
                  )}

                  {teacherTab === 'user_management' && dataService.isHeadAdmin() && (
                    <div className="space-y-6 mb-6">
                      <PageHeader
                        icon={ShieldCheck}
                        tone="warning"
                        title="Yönetim"
                        description="Veri yedeği, kurumlar, kullanıcılar ve yetkiler"
                      />
                      <AdminMaintenancePanel />
                      {dataService.isKurumSupported() && <KurumManagement classes={classes} />}
                    </div>
                  )}

                  {teacherTab === 'user_management' && dataService.isKurumAdmin() && (
                    <PageHeader
                      icon={ShieldCheck}
                      tone="warning"
                      title={dataService.getMyKurum().kurumName || 'Kurumum'}
                      description="Kurumunuzun öğretmenleri, öğrencileri ve yetkileri"
                    />
                  )}

                  {teacherTab === 'user_management' && (
                    <AdminUserManagement
                      currentAdmin={currentTeacher}
                      onNavigateHome={() => setTeacherTab('home')}
                    />
                  )}
                  </Suspense>
                  )}
                </ModuleErrorBoundary>
              </div>
            )}
          </div>
        ) : (
          /* ================= STUDENT DASHBOARD ================= */
          currentStudent ? (
            <Suspense fallback={<PageLoading />}>
            <StudentPortal
              key={currentStudent.id}
              currentStudent={currentStudent}
              homeworks={homeworks}
              submissions={submissions}
              etuts={etuts}
              grades={grades}
              attendance={attendance}
              messages={messages}
            />
            </Suspense>
          ) : (
            <div className="ui-card p-10 text-center max-w-md mx-auto space-y-3">
              <GraduationCap className="w-12 h-12 text-brand-fg mx-auto" />
              <h2 className="text-xl font-bold text-fg">Öğrenci Girişi Yapılmadı</h2>
              <p className="text-sm text-muted">
                Öğrenci görünümünü incelemek için sistemde en az bir öğrenci bulunmalıdır.
              </p>
              <div className="flex items-center justify-center pt-2">
                <button
                  onClick={() => handleRoleChange('teacher')}
                  className="ui-btn ui-btn-primary"
                >
                  Öğretmen Paneline Dön
                </button>
              </div>
            </div>
          )
        )}
      </main>

      {/* Alt bilgi */}
      <footer className="mt-10 border-t border-line py-5 text-center text-xs text-subtle">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-2">
          <GraduationCap className="w-4 h-4" />
          <span>Eğitim Takip · {new Date().getFullYear()}</span>
        </div>
      </footer>

      {/* Öğretmen: hızlı arama (Ctrl+K) ve telefon alt menüsü */}
      {activeTeacher && (
        <CommandPalette
          isAdmin={isAdminTeacher}
          students={students}
          classes={classes}
          homeworks={homeworks}
          etuts={etuts}
          onNavigate={selectTeacherTab}
        />
      )}
      {showTeacherChrome && (
        <TeacherBottomNav
          activeTab={teacherTab}
          isAdmin={isAdminTeacher}
          unreadMessages={unreadMessagesCount}
          onSelect={selectTeacherTab}
          onLogout={handleLogout}
        />
      )}

      {/* MODALS */}
      <SupabaseGuideModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />

      {/* Admin Teacher Approvals & Permissions Modal */}
      <TeacherApprovalModal
        isOpen={isAdminApprovalModalOpen}
        onClose={() => setIsAdminApprovalModalOpen(false)}
      />

      {/* Şifre sıfırlama bağlantısıyla gelindiyse yeni şifre penceresi */}
      <PasswordRecoveryModal />
    </div>
  );
}
