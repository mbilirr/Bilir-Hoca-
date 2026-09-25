import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Database,
  Calendar,
  LogOut,
  UserCheck,
  GraduationCap,
  Bell,
  Menu,
  X,
  ArrowLeft,
  FolderArchive,
  Home,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { AuthPortal } from './components/Auth/AuthPortal';
import { TeacherLogin } from './components/Auth/TeacherLogin';
import { StudentAuthModal } from './components/Auth/StudentAuthModal';
import { StudentManagement } from './components/Teacher/StudentManagement';
import { HomeworkManagement } from './components/Teacher/HomeworkManagement';
import { EtutManagement } from './components/Teacher/EtutManagement';
import { TeacherMessages } from './components/Teacher/TeacherMessages';
import { TeacherStatsOverview } from './components/Teacher/TeacherStatsOverview';
import { TeacherHeroBanner } from './components/Teacher/TeacherHeroBanner';
import { TeacherEtutBell } from './components/Teacher/TeacherEtutBell';
import { TeacherDocumentsArchive } from './components/Teacher/Documents/TeacherDocumentsArchive';
import { QuestionTrackingView } from './components/Teacher/QuestionTrackingView';
import { AdminTeacherApprovalBanner } from './components/Teacher/AdminTeacherApprovalBanner';
import { TeacherApprovalModal } from './components/Teacher/TeacherApprovalModal';
import { StudentPortal } from './components/Student/StudentPortal';
import { SupabaseGuideModal } from './components/SupabaseGuideModal';
import { dataService } from './services/dataService';
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
} from './types';

export default function App() {
  // Authentication session gatekeeper (null = show AuthPortal before app opens)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    dataService.getAuthSession()
  );

  // Active view role ('teacher' or 'student')
  const [role, setRole] = useState<UserRole>(() => {
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
  const [isTeacherLoginOpen, setIsTeacherLoginOpen] = useState(false);
  const [isStudentAuthOpen, setIsStudentAuthOpen] = useState(false);
  const [studentAuthMode, setStudentAuthMode] = useState<'login' | 'register'>('login');
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isAdminApprovalModalOpen, setIsAdminApprovalModalOpen] = useState(false);

  // Teacher active navigation tab (Varsayılan olarak 'home' - Sadece Ajanda ve Durum Özetleri)
  const [teacherTab, setTeacherTab] = useState<TeacherTabType>('home');

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Subscribe to state changes in dataService
  useEffect(() => {
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

      const activeSession = dataService.getAuthSession();
      setAuthSession(activeSession);
      if (activeSession?.role === 'student') {
        setCurrentStudent(activeSession.user as Student);
        setRole('student');
      }
    });

    return () => unsubscribe();
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
      dataService.syncEtutsFromSupabase(true);
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

    // Bilgisayar, tablet ve telefon arasında etüt ve kullanıcı verilerini anında buluttan çek
    try {
      await dataService.syncEtutsFromSupabase(true);
      await dataService.forceSyncTeachers();
      setEtuts(dataService.getEtuts());
      setStudents(dataService.getStudents());
      setClasses(dataService.getClasses());
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

  const handleOpenStudentLogin = () => {
    setStudentAuthMode('login');
    setIsStudentAuthOpen(true);
  };

  const handleOpenStudentRegister = () => {
    setStudentAuthMode('register');
    setIsStudentAuthOpen(true);
  };

  const handleStudentAuthSuccess = (student: Student) => {
    const session: AuthSession = { role: 'student', user: student };
    dataService.setAuthSession(session);
    setCurrentStudent(student);
    setRole('student');
    setTeacherTab('home');
    setIsStudentAuthOpen(false);
  };

  const unreadMessagesCount = messages.filter((m) => !m.read).length;

  // ================= GATEKEEPER CHECK =================
  // If not authenticated, render the initial entrance login/register portal before the app opens
  if (!authSession) {
    return (
      <div className="relative min-h-screen">
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Main Navbar */}
      <Navbar
        role={role}
        authSession={authSession}
        onRoleChange={handleRoleChange}
        onOpenTeacherLogin={() => setIsTeacherLoginOpen(true)}
        onOpenStudentLogin={handleOpenStudentLogin}
        onOpenStudentRegister={handleOpenStudentRegister}
        onOpenSupabaseGuide={() => setIsSupabaseModalOpen(true)}
        currentStudent={currentStudent}
        onLogout={handleLogout}
        onStudentLogout={handleLogout}
        activeTeacherTab={teacherTab}
        onSelectTeacherTab={(tab) => setTeacherTab(tab)}
        unreadMessagesCount={unreadMessagesCount}
        documentsCount={documents.length}
      />

      {/* Teacher Viewing Student Portal Notice Banner */}
      {authSession.role === 'teacher' && role === 'student' && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>
                <strong>Öğretmen Görünümü:</strong> Şu anda öğrenci portalı arayüzünü inceliyorsunuz.
                (Öğrenciler giriş yaptığında yalnızca bu paneli görebilir.)
              </span>
            </div>
            <button
              onClick={() => {
                setRole('teacher');
                setTeacherTab('home');
              }}
              className="flex items-center space-x-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Öğretmen Paneline Dön</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {role === 'teacher' ? (
          /* ================= TEACHER DASHBOARD ================= */
          <div className="space-y-6">
            {/* Kurum Yöneticisi Admin Onay Bildirimi Duvarı */}
            {(activeTeacher?.isAdmin || currentTeacher?.isAdmin) && (
              <AdminTeacherApprovalBanner
                onOpenFullModal={() => setIsAdminApprovalModalOpen(true)}
              />
            )}

            {/* ANA SAYFA: Sadece Ajanda Duvarı ve Durum Özetleri Duvarı */}
            {teacherTab === 'home' && (
              <>
                {/* Duvar 1: Solunda Öğretmen Görseli, Sağında Güncel Ayı Gösteren Ajanda */}
                <TeacherHeroBanner
                  currentTeacher={currentTeacher}
                  etuts={etuts}
                  homeworks={homeworks}
                  onNavigateTab={(tab) => setTeacherTab(tab)}
                />

                {/* Duvar 2: Öğretmen Yönetim & İstatistik Özet Kartları (Durum Özetleri) */}
                <TeacherStatsOverview
                  students={students}
                  classes={classes}
                  homeworks={homeworks}
                  submissions={submissions}
                  etuts={etuts}
                  onNavigateTab={(tab) => setTeacherTab(tab)}
                  currentRole={role}
                  onRoleChange={handleRoleChange}
                  headerRightSlot={
                    <div className="flex items-center space-x-2">
                      <span className="hidden sm:inline text-xs text-slate-400 font-medium">
                        Etüt Uyarı Zili:
                      </span>
                      <TeacherEtutBell
                        etuts={etuts}
                        students={students}
                        onOpenEtutsTab={() => setTeacherTab('etuts')}
                      />
                    </div>
                  }
                />
              </>
            )}

            {/* SEÇİLİ ÇALIŞMA MODÜLÜ: Çalışma modülü butonundan hangi bölüm seçildiyse sayfada SADECE o bölüm gözükür */}
            {teacherTab !== 'home' && (
              <div className="space-y-4">
                {/* Navigasyon Başlığı & Ana Sayfaya Dönüş */}
                <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-3 shadow-md">
                  <div className="flex items-center space-x-2 text-xs sm:text-sm">
                    <span className="text-white font-black tracking-wide">
                      {teacherTab === 'students' && 'Öğrenci & Sınıf Yönetimi'}
                      {teacherTab === 'homework' && 'Kazanım & Ödev Takibi'}
                      {teacherTab === 'etuts' && 'Etüt & Birebir Takip'}
                      {teacherTab === 'messages' && 'Öğrenci Soruları & Mesajlaşma'}
                      {teacherTab === 'archive' && 'Plan & Zümre Arşivi'}
                      {teacherTab === 'question_tracking' && 'Soru Sayısı Takip & Analiz'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTeacherTab('home')}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-bold transition-all border border-slate-700 hover:border-slate-600 cursor-pointer shadow-sm"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ana Sayfaya Dön</span>
                  </button>
                </div>

                {/* Active Teacher View Tab */}
                {teacherTab === 'students' && (
                  <StudentManagement
                    students={students}
                    classes={classes}
                    onSelectStudentForHomework={(std) => {
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

                {teacherTab === 'question_tracking' && (
                  <QuestionTrackingView
                    classes={classes}
                    students={students}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          /* ================= STUDENT DASHBOARD ================= */
          currentStudent ? (
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
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-md mx-auto shadow-2xl space-y-4">
              <GraduationCap className="w-12 h-12 text-indigo-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Öğrenci Girişi Yapılmadı</h2>
              <p className="text-xs text-slate-400">
                Ödevlerinizi, etütlerinizi ve ders notlarınızı görüntülemek için lütfen giriş yapın veya yeni kayıt oluşturun.
              </p>
              <div className="flex items-center justify-center space-x-3 pt-2">
                <button
                  onClick={handleOpenStudentLogin}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Giriş Yap
                </button>
                <button
                  onClick={handleOpenStudentRegister}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700"
                >
                  Kayıt Ol
                </button>
              </div>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-slate-500">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsSupabaseModalOpen(true)}
              id="footer-supabase-btn"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-emerald-400 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer shadow-sm"
              title="Supabase Veritabanı ve Tablo Şeması Bilgisi"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Supabase</span>
            </button>
            <span className="text-slate-700">•</span>
            <span className="text-slate-400">Google Calendar & .ics Desteği Aktif</span>
          </div>
        </div>
      </footer>

      {/* MODALS */}
      <TeacherLogin
        isOpen={isTeacherLoginOpen}
        onClose={() => setIsTeacherLoginOpen(false)}
        onSuccess={() => {
          setRole('teacher');
        }}
      />

      <StudentAuthModal
        isOpen={isStudentAuthOpen}
        onClose={() => setIsStudentAuthOpen(false)}
        initialMode={studentAuthMode}
        classes={classes}
        onSuccess={handleStudentAuthSuccess}
      />

      <SupabaseGuideModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />

      {/* Admin Teacher Approvals & Permissions Modal */}
      <TeacherApprovalModal
        isOpen={isAdminApprovalModalOpen}
        onClose={() => setIsAdminApprovalModalOpen(false)}
      />
    </div>
  );
}
