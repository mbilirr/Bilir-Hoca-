import React, { useState, useEffect, useMemo, useRef, Suspense, startTransition } from 'react';
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
import { UnattendedEtutBanner } from './components/Admin/UnattendedEtutBanner';
import { ModuleErrorBoundary } from './components/Common/ModuleErrorBoundary';
import { NetworkSyncStatusBanner } from './components/Common/NetworkSyncStatusBanner';
import { useEtutNotes } from './components/Teacher/EtutNotesInbox';
import { dataService } from './services/dataService';
import { lazyNamed, PageLoading, prefetchModules } from './lib/lazyLoad';
// Aşama 103: nadiren açılan pencereler ana dosyada taşınmaz
const TeacherApprovalModal = lazyNamed(() => import('./components/Teacher/TeacherApprovalModal'), 'TeacherApprovalModal');
const SupabaseGuideModal = lazyNamed(() => import('./components/SupabaseGuideModal'), 'SupabaseGuideModal');
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
// Aşama 84: sayfa parçalarının yükleyicileri ortak: menüden açılırken de, önceden indirilirken de aynı parça kullanılır
const PAGE_LOADERS = {
  home: () => import('./components/Teacher/TeacherHome'),
  students: () => import('./components/Teacher/StudentManagement'),
  homework: () => import('./components/Teacher/HomeworkManagement'),
  etuts: () => import('./components/Teacher/EtutManagement'),
  messages: () => import('./components/Teacher/TeacherMessages'),
  archive: () => import('./components/Teacher/Documents/TeacherDocumentsArchive'),
  grades: () => import('./components/Teacher/GradeAttendance'),
  question_tracking: () => import('./components/Teacher/QuestionTrackingView'),
  deneme: () => import('./components/Deneme/DenemeAnalizi'),
} as const;
const STUDENT_LOADERS = [
  () => import('./components/Student/StudentPortal'),
  () => import('./components/Student/StudentQuestionModule'),
  () => import('./components/Student/StudentDenemeSonuclari'),
];
const StudentManagement = lazyNamed(PAGE_LOADERS.students, 'StudentManagement');
const HomeworkManagement = lazyNamed(PAGE_LOADERS.homework, 'HomeworkManagement');
const EtutManagement = lazyNamed(PAGE_LOADERS.etuts, 'EtutManagement');
const TeacherMessages = lazyNamed(PAGE_LOADERS.messages, 'TeacherMessages');
const TeacherHome = lazyNamed(PAGE_LOADERS.home, 'TeacherHome');
const TeacherDocumentsArchive = lazyNamed(PAGE_LOADERS.archive, 'TeacherDocumentsArchive');
const KurumManagement = lazyNamed(() => import('./components/Admin/KurumManagement'), 'KurumManagement');
const GradeAttendance = lazyNamed(PAGE_LOADERS.grades, 'GradeAttendance');
const QuestionTrackingView = lazyNamed(PAGE_LOADERS.question_tracking, 'QuestionTrackingView');
const DenemeAnalizi = lazyNamed(PAGE_LOADERS.deneme, 'DenemeAnalizi');
const AdminMaintenancePanel = lazyNamed(() => import('./components/Admin/AdminMaintenancePanel'), 'AdminMaintenancePanel');
const NotificationPolicyPanel = lazyNamed(() => import('./components/Admin/NotificationPolicyPanel'), 'NotificationPolicyPanel');
const TeacherRolesPanel = lazyNamed(() => import('./components/Admin/TeacherRolesPanel'), 'TeacherRolesPanel'); // Aşama 81
const KurumSettingsPanel = lazyNamed(() => import('./components/Admin/KurumSettingsPanel'), 'KurumSettingsPanel'); // Aşama 82
const AdminUserManagement = lazyNamed(() => import('./components/Admin/AdminUserManagement'), 'AdminUserManagement');
const UserCredentialsExport = lazyNamed(() => import('./components/Admin/UserCredentialsExport'), 'UserCredentialsExport');
const Asama25Rehberi = lazyNamed(() => import('./components/Admin/Asama25Rehberi'), 'Asama25Rehberi');
const StudentPortal = lazyNamed(STUDENT_LOADERS[0], 'StudentPortal');
// Aşama 107: önizlemede öğrenci seçme kutusu (yalnız önizleme açılınca indirilir)
const StudentSearchSelect = lazyNamed(() => import('./components/Common/StudentSearchSelect'), 'StudentSearchSelect');

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

// Aşama 105: çıkışta adres (#/teacher/...) temizlenir; aynı sekmede giren sonraki kişi eski bölüme düşmez
function resetRouteHash() {
  try {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {}
}

export default function App() {
  // Authentication session gatekeeper (null = show AuthPortal before app opens)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    dataService.getAuthSession()
  );

  // Active view role ('teacher' or 'student') — sayfa yenilenirse önce URL hash'ine bakılır
  const [role, setRole] = useState<UserRole>(() => {
    const saved = dataService.getAuthSession();
    // Aşama 105: öğrenci oturumu adres ne olursa olsun öğrenci görünümünde açılır
    if (saved?.role === 'student') return 'student';
    const fromHash = parseRouteHash();
    if (fromHash.role) return fromHash.role;
    return 'teacher';
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
  const [isAsama25GuideOpen, setIsAsama25GuideOpen] = useState(false);

  // Teacher active navigation tab — sayfa yenilenirse URL hash'inden geri yüklenir, yoksa 'home'
  const [teacherTab, setTeacherTab] = useState<TeacherTabType>(() => parseRouteHash().tab);

  // Data states from dataService
  const [students, setStudents] = useState<Student[]>(dataService.getStudents());
  const [classes, setClasses] = useState<ClassGroup[]>(dataService.getClasses());
  const [homeworks, setHomeworks] = useState<Homework[]>(dataService.getHomeworks());
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>(dataService.getSubmissions());
  const [etuts, setEtuts] = useState<Etut[]>(dataService.getVisibleEtuts());
  const [grades, setGrades] = useState<GradeRecord[]>(dataService.getGrades());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(dataService.getAttendance());
  const [messages, setMessages] = useState<StudentMessage[]>(dataService.getMessages());
  const [documents, setDocuments] = useState<TeacherDocument[]>(dataService.getTeacherDocuments());
  const [questionLogs, setQuestionLogs] = useState<StudentQuestionLog[]>(dataService.getQuestionLogs());
  const [pendingApplications, setPendingApplications] = useState<number>(dataService.getPendingApplicationCount());
  const [, setDataRev] = useState(0);

  // Subscribe to state changes in dataService and ensure initial remote sync
  useEffect(() => {
    // Initial mount sync across all devices
    dataService.setupAllRealtimeSync();
    dataService.revalidateAndSyncAll(true);

    const unsubscribe = dataService.subscribe(() => {
      // Aşama 84: oturum nesnesi artık değişmedikçe aynı kalır; sayfalar dataService'ten okuduklarını
      // güncel göstersin diye her bildirimde bir kez yeniden çizilir (eskisi gibi)
      setDataRev((n) => n + 1);
      setStudents(dataService.getStudents());
      setClasses(dataService.getClasses());
      setHomeworks(dataService.getHomeworks());
      setSubmissions(dataService.getSubmissions());
      setEtuts(dataService.getVisibleEtuts());
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
    const current = window.location.hash;
    // Öğrenci portalı kendi bölümünü adrese ekler (#/student/homework gibi); bu adresi ezme,
    // yoksa "Geri" tuşu öğrencinin önceki bölümüne değil başka bir sayfaya gider.
    const alreadyThere = role === 'student' ? current === hash || current.startsWith(hash + '/') : current === hash;
    if (!alreadyThere) {
      window.history.pushState(null, '', hash);
    }
  }, [role, teacherTab, authSession]);

  // Tarayıcıda geri/ileri tuşuna basıldığında hash'ten state'i geri yükle
  useEffect(() => {
    const handlePopState = () => {
      const { role: hRole, tab } = parseRouteHash();
      // Aşama 105: öğrenci oturumunda "Geri" tuşu öğretmen paneline geçiremez
      if (dataService.getAuthSession()?.role === 'student') {
        setRole('student');
        return;
      }
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
        resetRouteHash();
        setAuthSession(null);
        setCurrentStudent(null);
        setRole('teacher');
        setTeacherTab('home');
      }
    });
  }, []);

  const lastActivityRef = useRef<number>(Date.now());

  // Kullanılmadığında Oturumu Otomatik Sonlandırma (süre role göre değişir, aşağıya bakın)
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

    // Aşama 26: hareketsizlik süresi role göre belirlenir
    //  - genel yönetici: 1 gün (24 saat)
    //  - kurum yöneticisi: 30 dakika
    //  - öğretmen ve öğrenci: 15 dakika
    const getIdleLimitMs = () => {
      if (dataService.isHeadAdmin()) return 24 * 60 * 60 * 1000;
      if (dataService.isKurumAdmin() || dataService.isCurrentUserAdmin()) return 30 * 60 * 1000;
      return 15 * 60 * 1000;
    };

    const performInactivityCheck = () => {
      const activeSession = dataService.getAuthSession();
      if (activeSession) {
        const now = Date.now();
        const diff = now - lastActivityRef.current;
        if (diff >= getIdleLimitMs()) {
          dataService.logout();
          resetRouteHash();
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
    setEtuts(dataService.getVisibleEtuts());

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
      setEtuts(dataService.getVisibleEtuts());
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
    resetRouteHash();
    setAuthSession(null);
    setCurrentStudent(null);
    setRole('teacher');
    setTeacherTab('home');
  };

  // Aşama 32: Mesajlar sayacına görülmemiş etüt notları (yoklamada yazılan farklı konu / öğrenci notu) da eklenir
  const { unseen: etutNoteUnseen } = useEtutNotes();
  // Aşama 113: yalnız bana gelen ve genel okunmamış mesajlar (idarenin gördüğü başka öğretmene gelen sorular sayılmaz)
  const unreadMessagesCount = useMemo(() => messages.filter((m) => !m.read && dataService.isMessageForMe(m)).length, [messages, authSession]) + (authSession?.role === 'teacher' ? etutNoteUnseen : 0);

  // ================= GATEKEEPER CHECK =================
  // If not authenticated, render the initial entrance login/register portal before the app opens
  // Aşama 84: giriş yapıldıktan sonra kişinin açabileceği bölümlerin parçaları tarayıcı boşken önceden indirilir
  const sessionRole = authSession?.role || null;
  useEffect(() => {
    if (sessionRole === 'student') return prefetchModules(STUDENT_LOADERS);
    if (sessionRole !== 'teacher') return;
    const order: Array<keyof typeof PAGE_LOADERS> = ['home', 'students', 'homework', 'etuts', 'messages', 'grades', 'question_tracking', 'deneme', 'archive'];
    return prefetchModules(order.filter((t) => t === 'home' || dataService.canUseTab(t as TeacherTabType)).map((t) => PAGE_LOADERS[t]));
  }, [sessionRole]);

  // Aşama 82: yalnızca Etüt Öğretmeni rolü olan kişi doğrudan Etütler bölümünde açılır (ana sayfa öğrenci özetleri içerir)
  useEffect(() => {
    if (role === 'teacher' && teacherTab === 'home' && dataService.roleEtutOnly() && dataService.canUseTab('etuts')) {
      setTeacherTab('etuts');
    }
  });

  // Aşama 107: öğretmen öğrenci görünümündeyken veri katmanı da salt okunur olur
  const studentPreview = authSession?.role === 'teacher' && role === 'student';
  useEffect(() => {
    dataService.setStudentPreview(studentPreview);
  }, [studentPreview]);

  // Aşama 83: tarayıcı sekmesinde kişinin kurumunun adı görünür
  const brandTitle = authSession ? dataService.getBrand().name : '';
  useEffect(() => {
    document.title = brandTitle ? `${brandTitle} · Eğitim Takip` : 'Eğitim & Öğrenci Takip Sistemi';
  }, [brandTitle]);

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
    // Aşama 84: yeni bölüm arka planda hazırlanır; o sırada ekran donmaz, önceki bölüm görünür kalır
    startTransition(() => setTeacherTab(tab));
    setStudents(dataService.getStudents());
    setClasses(dataService.getClasses());
    setHomeworks(dataService.getHomeworks());
    setEtuts(dataService.getVisibleEtuts());
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
          <div className="max-w-[120rem] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 shrink-0" />
              <span>
                <strong>Öğrenci görünümü (önizleme):</strong> Salt okunur; öğrenci adına işlem yapılamaz.
              </span>
            </div>
            {/* Aşama 107: önizlenecek öğrenci seçilir */}
            <Suspense fallback={null}>
              <div className="w-64 max-w-full">
              <StudentSearchSelect
                id="preview-student-select"
                students={students}
                value={currentStudent?.id || ''}
                onChange={(id: string) => {
                  const st = students.find((x) => x.id === id);
                  if (st) setCurrentStudent(st);
                }}
                placeholder="Öğrenci seçin"
                ariaLabel="Önizlenecek öğrenci"
                className="ui-input h-8 min-h-0 py-0 text-xs bg-surface"
              />
              </div>
            </Suspense>
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
      <main className="flex-1 app-container py-4 sm:py-6">
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

            {/* Yönetici (genel ve kurum): etüdü bitmiş ama yoklaması alınmamış etütler */}
            {(dataService.isHeadAdmin() || dataService.isKurumAdmin()) && dataService.canUseTab('etuts') && teacherTab !== 'etuts' && (
              <UnattendedEtutBanner onOpenEtuts={() => setTeacherTab('etuts')} />
            )}

            {/* Yönetici: bekleyen öğrenci kayıt başvuruları */}
            {dataService.canReviewApplications() && pendingApplications > 0 && teacherTab !== 'user_management' && (
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
            {teacherTab === 'home' && !dataService.roleEtutOnly() && (
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

            {/* Aşama 105: yalnız Etüt Öğretmeni rolü olan kişiye Etütler bölümü kapalıysa boş sayfa yerine bilgi */}
            {teacherTab === 'home' && dataService.roleEtutOnly() && !dataService.canUseTab('etuts') && (
              <div className="ui-card p-8 text-center space-y-3 max-w-xl mx-auto" id="etut-only-locked">
                <ShieldCheck className="w-8 h-8 mx-auto text-warning-fg" />
                <h2 className="text-lg font-bold text-fg">Size açık bir bölüm yok</h2>
                <p className="text-sm text-muted">
                  Unvanınız yalnızca Etüt Öğretmeni; Etütler bölümü ise şu anda size kapalı. Kurum yöneticinize başvurun.
                </p>
              </div>
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
                      <h2 className="text-lg font-bold text-fg">{dataService.rolesActive() ? 'Bu bölüm rolünüze açık değil' : 'Bu bölüm kurumunuz için kapalı'}</h2>
                      <p className="text-sm text-muted">
                        {dataService.rolesActive()
                          ? `"${findTeacherNav(teacherTab)?.title || 'Bu bölüm'}" bölümü size verilen unvanın (rolün) yetkileri içinde değil. Gerekirse kurum yöneticinize başvurun.`
                          : `"${findTeacherNav(teacherTab)?.title || 'Bu bölüm'}" bölümünü kullanma izni genel yönetici tarafından verilmemiş.`}
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

                  {teacherTab === 'deneme' && <DenemeAnalizi students={students} classes={classes} />}

                  {teacherTab === 'user_management' && dataService.isHeadAdmin() && (
                    <div className="space-y-6 mb-6">
                      <PageHeader
                        icon={ShieldCheck}
                        tone="warning"
                        title="Yönetim"
                        description="Veri yedeği, kurumlar, kullanıcılar ve yetkiler"
                        actions={
                          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setIsAsama25GuideOpen(true)}>
                            Aşama 25 Rehberi
                          </button>
                        }
                      />
                      <AdminMaintenancePanel />
                      <NotificationPolicyPanel />
                      <UserCredentialsExport classes={classes} />
                      {dataService.isKurumSupported() && <KurumManagement classes={classes} />}
                      <KurumSettingsPanel />
                      <TeacherRolesPanel />
                    </div>
                  )}

                  {teacherTab === 'user_management' && dataService.isKurumAdmin() && (
                    <div className="space-y-6 mb-6">
                      <PageHeader
                        icon={ShieldCheck}
                        tone="warning"
                        title={dataService.getMyKurum().kurumName || 'Kurumum'}
                        description="Kurumunuzun öğretmenleri, öğrencileri ve yetkileri"
                      />
                      <UserCredentialsExport classes={classes} />
                      <KurumSettingsPanel />
                      <TeacherRolesPanel />
                    </div>
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
              preview={authSession.role === 'teacher'}
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
        <div className="max-w-[120rem] mx-auto px-4 flex items-center justify-center gap-2">
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
      {isSupabaseModalOpen && (
        <Suspense fallback={null}>
          <SupabaseGuideModal isOpen onClose={() => setIsSupabaseModalOpen(false)} />
        </Suspense>
      )}

      {/* Admin Teacher Approvals & Permissions Modal */}
      {isAdminApprovalModalOpen && (
        <Suspense fallback={null}>
          <TeacherApprovalModal isOpen onClose={() => setIsAdminApprovalModalOpen(false)} />
        </Suspense>
      )}

      {/* Aşama 25 rehberi (yalnızca genel yönetici, Yönetim sayfasındaki düğmeyle açılır) */}
      {isAsama25GuideOpen && (
        <Suspense fallback={null}>
          <Asama25Rehberi isOpen={isAsama25GuideOpen} onClose={() => setIsAsama25GuideOpen(false)} />
        </Suspense>
      )}

      {/* Şifre sıfırlama bağlantısıyla gelindiyse yeni şifre penceresi */}
      <PasswordRecoveryModal />
    </div>
  );
}
