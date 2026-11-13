import React, { useState, useEffect, useMemo, useRef, Suspense, startTransition } from 'react';
import { GraduationCap, Bell, ArrowLeft, Eye, ShieldCheck } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { CommandPalette } from './components/Layout/CommandPalette';
import { TeacherBottomNav } from './components/Layout/BottomNav';
import { anaSayfaTuru } from './components/Home/anaSayfaSecimi'; // Aşama 244
import { findTeacherNav } from './components/Layout/navItems';
import { AuthPortal } from './components/Auth/AuthPortal';
import { PortalSecimi } from './components/Auth/PortalSecimi'; // Aşama 243
import { SolMenu, ogretmenMenuOgeleri } from './components/Layout/SolMenu'; // Aşama 260
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
import { supabase } from './lib/supabase';
import { KullaniciGozuSeridi } from './components/Layout/KullaniciGozuSeridi';
import { HesapSecimi } from './components/Auth/HesapSecimi'; // Aşama 256
import { bagliHesabaGec, bagliHesaplar, hesapSecildi, hesapSecimiSifirla, hesapSecimiYapildi, hesapTercihOku, readGecis, type BagliHesap } from './lib/kurumGecis'; // Aşama 256
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
  students: () => import('./components/Teacher/StudentManagement'),
  homework: () => import('./components/Teacher/HomeworkManagement'),
  etuts: () => import('./components/Teacher/EtutManagement'),
  messages: () => import('./components/Teacher/TeacherMessages'),
  archive: () => import('./components/Teacher/Documents/TeacherDocumentsArchive'),
  grades: () => import('./components/Teacher/DerslerSayfasi'), // Aşama 220: Dersler (Program + Notlar)
  question_tracking: () => import('./components/Teacher/QuestionTrackingView'),
  deneme: () => import('./components/Deneme/DenemeAnalizi'),
  akademik_takvim: () => import('./components/Teacher/AkademikTakvim'), // Aşama 242
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
const TeacherDocumentsArchive = lazyNamed(PAGE_LOADERS.archive, 'TeacherDocumentsArchive');
const DerslerSayfasi = lazyNamed(PAGE_LOADERS.grades, 'DerslerSayfasi'); // Aşama 220
const QuestionTrackingView = lazyNamed(PAGE_LOADERS.question_tracking, 'QuestionTrackingView');
const DenemeAnalizi = lazyNamed(PAGE_LOADERS.deneme, 'DenemeAnalizi');
const AkademikTakvim = lazyNamed(PAGE_LOADERS.akademik_takvim, 'AkademikTakvim'); // Aşama 242
// Aşama 244: yeni tasarımlı ana sayfalar (sol menü + hayalet etiket). Hangisinin açılacağı anaSayfaTuru() ile seçilir.
const SistemSahibiAnaSayfa = lazyNamed(() => import('./components/Home/SistemSahibiAnaSayfa'), 'SistemSahibiAnaSayfa');
const KurumYoneticisiAnaSayfa = lazyNamed(() => import('./components/Home/KurumYoneticisiAnaSayfa'), 'KurumYoneticisiAnaSayfa'); // Aşama 245
const MudurAnaSayfa = lazyNamed(() => import('./components/Home/MudurAnaSayfa'), 'MudurAnaSayfa'); // Aşama 246
const MudurYardimcisiAnaSayfa = lazyNamed(() => import('./components/Home/MudurYardimcisiAnaSayfa'), 'MudurYardimcisiAnaSayfa'); // Aşama 247
const OgretmenAnaSayfa = lazyNamed(() => import('./components/Home/OgretmenAnaSayfa'), 'OgretmenAnaSayfa'); // Aşama 248
const RehberlikAnaSayfa = lazyNamed(() => import('./components/Home/RehberlikAnaSayfa'), 'RehberlikAnaSayfa'); // Aşama 249
const OlcmeAnaSayfa = lazyNamed(() => import('./components/Home/OlcmeAnaSayfa'), 'OlcmeAnaSayfa'); // Aşama 253
const EtutAnaSayfa = lazyNamed(() => import('./components/Home/EtutAnaSayfa'), 'EtutAnaSayfa'); // Aşama 253
const YonetimSayfasi = lazyNamed(() => import('./components/Admin/YonetimSayfasi'), 'YonetimSayfasi'); // Aşama 143
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
  const [rolSecimi, setRole] = useState<UserRole>(() => {
    const saved = dataService.getAuthSession();
    // Aşama 105: öğrenci oturumu adres ne olursa olsun öğrenci görünümünde açılır
    if (saved?.role === 'student') return 'student';
    const fromHash = parseRouteHash();
    if (fromHash.role) return fromHash.role;
    return 'teacher';
  });
  // Aşama 254: öğrenci oturumunda görünüm HER ZAMAN öğrencidir. Hiçbir düğme / adres / geri tuşu öğrenciye
  // öğretmen panelini (eski ana sayfa) açamaz; tek yerde, oturumdan türetilir.
  const role: UserRole = authSession?.role === 'student' ? 'student' : rolSecimi;
  // Öğrenci oturumunda üstteki logo ("Ana Sayfa") öğrenci ana sayfasına döndürür
  const [ogrAnaSayfaSinyal, setOgrAnaSayfaSinyal] = useState(0);

  const [currentStudent, setCurrentStudent] = useState<Student | null>(() => {
    const saved = dataService.getAuthSession();
    if (saved?.role === 'student') {
      return saved.user as Student;
    }
    return null;
  });

  const currentTeacher = authSession?.role === 'teacher' ? (authSession.user as Teacher) : null;

  // Modals
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
  // Aşama 125: bildirimde oturumun değişip değişmediğini anlamak için son çizilen oturum
  const authSessionRef = useRef<AuthSession | null>(authSession);
  authSessionRef.current = authSession;

  // Subscribe to state changes in dataService and ensure initial remote sync
  useEffect(() => {
    // Initial mount sync across all devices
    dataService.setupAllRealtimeSync();
    dataService.revalidateAndSyncAll(true);

    // Aşama 125 (hız): veri yenilemesi "acil olmayan" güncelleme olarak çizilir (startTransition).
    // Arka planda eşitleme gelirken yazma, tıklama ve kaydırma takılmaz; React çizimi gerekirse
    // böler ve kullanıcının işini öne alır. Oturum / rol değişikliği acil kalır (hemen çizilir).
    // Sekme / uygulama arka plandayken ekran yeniden çizilmez; veri yine alınır ve saklanır,
    // sekmeye dönülünce tek seferde en güncel hâliyle çizilir (telefon pili ve işlemci için).
    let pendingWhileHidden = false;
    const applyData = () => {
      const activeSession = dataService.getAuthSession();
      setAuthSession(activeSession);
      if (activeSession?.role === 'student') {
        setCurrentStudent(activeSession.user as Student);
        setRole('student');
      }
      startTransition(() => {
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
      });
    };
    const unsubscribe = dataService.subscribe(() => {
      // Oturum kapandıysa / açıldıysa sekme gizli olsa bile hemen uygulanır
      const sessionChanged = dataService.getAuthSession() !== authSessionRef.current;
      if (!sessionChanged && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        pendingWhileHidden = true;
        return;
      }
      pendingWhileHidden = false;
      applyData();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pendingWhileHidden) {
        pendingWhileHidden = false;
        applyData();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
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
    // Aşama 256: yeni girişte hesap seçimi yeniden sorulur
    hesapSecimiSifirla();
    setHesapSecimBitti(false);
    setHesapListe(null);
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
  // Aşama 244: yeni tasarımlı (kabuklu) ana sayfa: menü solda, üst menünün bölüm satırı gizli
  const kabukluAnaSayfa = authSession?.role === 'teacher' && role === 'teacher' && teacherTab === 'home' ? anaSayfaTuru() : null;
  // Aşama 250 / 255: kurum bilgisi (rol, bölümler) gelmeden hangi ana sayfanın açılacağı bilinmez. Eski ana sayfa (TeacherHome)
  // kaldırıldı: bilgi gelene kadar sade bekleme ekranı görünür; 8 saniyede gelmezse "Yeniden dene" çıkar (eski sayfaya düşülmez).
  const anaSayfaBekliyor = authSession?.role === 'teacher' && role === 'teacher' && teacherTab === 'home' && !kabukluAnaSayfa;
  const [kurumGecikti, setKurumGecikti] = useState(false);
  const [kurumDeneniyor, setKurumDeneniyor] = useState(false);
  useEffect(() => {
    if (!anaSayfaBekliyor) {
      setKurumGecikti(false);
      return;
    }
    const t = setTimeout(() => setKurumGecikti(true), 8000);
    return () => clearTimeout(t);
  }, [anaSayfaBekliyor]);
  const kurumYenidenDene = async () => {
    setKurumDeneniyor(true);
    setKurumGecikti(false);
    try {
      await dataService.syncMyKurum();
    } catch {
      /* bağlantı yok: aşağıda yeniden denenir */
    } finally {
      setKurumDeneniyor(false);
      setDataRev((n) => n + 1);
      setTimeout(() => setKurumGecikti(true), 8000);
    }
  };

  // ================= GATEKEEPER CHECK =================
  // If not authenticated, render the initial entrance login/register portal before the app opens
  // Aşama 84: giriş yapıldıktan sonra kişinin açabileceği bölümlerin parçaları tarayıcı boşken önceden indirilir
  const sessionRole = authSession?.role || null;
  useEffect(() => {
    if (sessionRole === 'student') return prefetchModules(STUDENT_LOADERS);
    if (sessionRole !== 'teacher') return;
    const order: Array<keyof typeof PAGE_LOADERS> = ['students', 'homework', 'etuts', 'messages', 'grades', 'question_tracking', 'deneme', 'archive'];
    return prefetchModules(order.filter((t) => dataService.canUseTab(t as TeacherTabType)).map((t) => PAGE_LOADERS[t]));
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

  // Aşama 256: sistem sahibi girişte "Sistem sahibi / bağlı öğretmen hesabı" seçer (bağlı hesap yoksa sorulmaz).
  // Seçim bu oturumda bir kez yapılır; "hatırla" seçiliyse sorulmadan o hesap açılır.
  const hesapSecimAday = authSession?.role === 'teacher' && dataService.isHeadAdmin() && !readGecis() && !hesapSecimiYapildi();
  const [hesapListe, setHesapListe] = useState<BagliHesap[] | null>(null);
  const [hesapSecimBitti, setHesapSecimBitti] = useState(false);
  useEffect(() => {
    if (!hesapSecimAday || hesapSecimBitti) return;
    let iptal = false;
    const bitir = () => {
      hesapSecildi();
      if (!iptal) setHesapSecimBitti(true);
    };
    bagliHesaplar()
      .then(async (l) => {
        if (iptal) return;
        if (!l.length) return bitir();
        const tercih = hesapTercihOku();
        if (tercih === 'sahip') return bitir();
        if (tercih && l.some((h) => h.authUserId === tercih)) {
          try {
            await bagliHesabaGec(tercih);
          } catch {
            /* geçilemezse seçim ekranı gösterilir */
          }
        }
        if (!iptal) setHesapListe(l);
      })
      .catch(() => bitir()); // okunamazsa sistem sahibi paneli açılır (giriş engellenmez)
    return () => {
      iptal = true;
    };
  }, [hesapSecimAday, hesapSecimBitti]);
  const hesapSecimBekliyor = hesapSecimAday && !hesapSecimBitti;

  // Aşama 83: tarayıcı sekmesinde kişinin kurumunun adı görünür
  const brandTitle = authSession ? dataService.getBrand().name : '';
  useEffect(() => {
    document.title = brandTitle ? `${brandTitle} · biliredu` : 'biliredu';
  }, [brandTitle]);

  if (!authSession) {
    return (
      <div className="relative min-h-screen">
        <KullaniciGozuSeridi />
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

  // Aşama 256: sistem sahibinin hesap seçimi
  if (hesapSecimBekliyor) {
    return (
      <div className="relative min-h-screen">
        <NetworkSyncStatusBanner />
        {hesapListe ? (
          <HesapSecimi
            ad={(authSession.user as Teacher).name}
            liste={hesapListe}
            onSahip={() => {
              setHesapSecimBitti(true);
              setRole('teacher');
              setTeacherTab('home');
            }}
            onCikis={handleLogout}
          />
        ) : (
          <PageLoading />
        )}
      </div>
    );
  }

  // Aşama 243: birden çok görevi olan kurum yöneticisi önce portalını seçer (seçim hatırlanıyorsa sorulmaz)
  if (authSession.role === 'teacher' && dataService.portalSecimiGerekli()) {
    return (
      <div className="relative min-h-screen">
        {/* Aşama 252: kullanıcı gözüyle bakarken üstte şerit */}
        <KullaniciGozuSeridi />
        <NetworkSyncStatusBanner />
        <PortalSecimi
          ad={(authSession.user as Teacher).name}
          onSec={() => {
            setRole('teacher');
            setTeacherTab('home');
          }}
          onCikis={handleLogout}
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
    if (authSession?.role === 'student') {
      if (tab === 'home') setOgrAnaSayfaSinyal((n) => n + 1);
      return;
    }
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
      {/* Aşama 252: kullanıcı gözüyle bakarken üstte şerit (bütün sayfalarda) */}
      <KullaniciGozuSeridi />
      <NetworkSyncStatusBanner />
      {/* Top Main Navbar */}
      <Navbar
        role={role}
        authSession={authSession}
        onRoleChange={handleRoleChange}
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

      {/* Aşama 260: ana sayfa dışındaki her öğretmen / idare / yönetici sayfasında solda simge menü (ana sayfa kabuğu kendi
          menüsünü aynı öğelerle çizer; öğrenci portalı kendi menüsünü kurar) */}
      {showTeacherChrome && teacherTab !== 'home' && (
        <SolMenu ogeler={ogretmenMenuOgeleri(currentTeacher, teacherTab, selectTeacherTab, unreadMessagesCount)} />
      )}

      {/* Aşama 260: içerik ve alt bilgi sol menünün sağından başlar (menü yoksa boşluk yok) */}
      <div className="sol-menu-alan flex-1 flex flex-col min-w-0">
      {/* Main Container */}
      {/* Aşama 253: öğrenci portalı kendi kabını kurar (ana sayfası tam genişlik kabuk, diğer bölümler app-container) */}
      <main className={kabukluAnaSayfa || (role === 'student' && currentStudent) ? 'flex-1' : 'flex-1 app-container py-4 sm:py-6'}>
        {anaSayfaBekliyor ? (
          kurumGecikti && !kurumDeneniyor ? (
            <div className="ui-card p-8 text-center space-y-3 max-w-md mx-auto mt-10" id="ana-sayfa-bekleme" role="status">
              <h2 className="text-base font-bold text-fg">Kurum bilgileri alınamadı</h2>
              <p className="text-sm text-muted">Bağlantı yavaş ya da kesik olabilir. Ana sayfa, bilgiler gelince açılır.</p>
              <button type="button" onClick={() => void kurumYenidenDene()} className="ui-btn ui-btn-primary ui-btn-sm w-28 mx-auto">
                Yeniden dene
              </button>
            </div>
          ) : (
            <PageLoading />
          )
        ) : role === 'teacher' && kabukluAnaSayfa === 'sistem' ? (
          /* Aşama 244: sistem sahibi ana sayfası (tam genişlik; yedek hatırlatması ve uyarılar sayfanın içinde) */
          <Suspense fallback={<PageLoading />}>
            <SistemSahibiAnaSayfa currentTeacher={currentTeacher} unreadMessages={unreadMessagesCount} onNavigateTab={selectTeacherTab} />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'kurum' ? (
          /* Aşama 245: kurum yöneticisi ana sayfası (kurumun açık bölümlerinden; geciken yoklama ve etüt sayfanın içinde) */
          <Suspense fallback={<PageLoading />}>
            <KurumYoneticisiAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              etuts={etuts}
              homeworks={homeworks}
              submissions={submissions}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
            />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'mudur' ? (
          /* Aşama 246: müdür ana sayfası (Odak renkleri; kurumun açık bölümlerinden) */
          <Suspense fallback={<PageLoading />}>
            <MudurAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              etuts={etuts}
              homeworks={homeworks}
              submissions={submissions}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
            />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'mudur_yrd' ? (
          /* Aşama 247: müdür yardımcısı ana sayfası (bugünün yoklama haritası; kurumun açık bölümlerinden) */
          <Suspense fallback={<PageLoading />}>
            <MudurYardimcisiAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              etuts={etuts}
              homeworks={homeworks}
              submissions={submissions}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
            />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'rehberlik' ? (
          /* Aşama 249: rehberlik ana sayfası (okulun nabzı, rehberlik masası; kurumun açık bölümlerinden, yoklamayı yalnız okur) */
          <Suspense fallback={<PageLoading />}>
            <RehberlikAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              etuts={etuts}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
            />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'olcme' ? (
          /* Aşama 253: ölçme ve değerlendirme ana sayfası (son deneme, net değişimi ve kazanım özeti; Deneme bölümü açıksa) */
          <Suspense fallback={<PageLoading />}>
            <OlcmeAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
            />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'etut' ? (
          /* Aşama 253: etüt öğretmeni ana sayfası (sıradaki etüt, yoklama, bu hafta; öğrenciler yalnız özet) */
          <Suspense fallback={<PageLoading />}>
            <EtutAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              etuts={etuts}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
            />
          </Suspense>
        ) : role === 'teacher' && kabukluAnaSayfa === 'ogretmen' ? (
          /* Aşama 248: öğretmen ana sayfası (şimdi kartı, sizi bekleyenler; kurumun açık bölümlerinden) */
          <Suspense fallback={<PageLoading />}>
            <OgretmenAnaSayfa
              currentTeacher={currentTeacher}
              students={students}
              classes={classes}
              homeworks={homeworks}
              submissions={submissions}
              etuts={etuts}
              messages={messages}
              unreadMessages={unreadMessagesCount}
              onNavigateTab={selectTeacherTab}
              onOpenStudentView={() => handleRoleChange('student')}
            />
          </Suspense>
        ) : role === 'teacher' ? (
          /* ================= TEACHER DASHBOARD ================= */
          <div className="space-y-6">
            {/* Kurum Yöneticisi Admin Onay Bildirimi Duvarı */}
            {(dataService.yoneticiKaydi(activeTeacher) || dataService.yoneticiKaydi(currentTeacher)) && dataService.isHeadAdmin() && (
              <AdminTeacherApprovalBanner
                onOpenFullModal={() => setIsAdminApprovalModalOpen(true)}
              />
            )}

            {/* Yönetici: veri yedeği hatırlatması (son yedek 7 günden eskiyse) */}
            {dataService.yoneticiKaydi(activeTeacher) && dataService.isHeadAdmin() && teacherTab !== 'user_management' && (
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
                      <h2 className="text-lg font-bold text-fg">
                        {dataService.yonetimMerkezi() ? 'Kendi paneliniz yönetim merkezidir' : dataService.rolesActive() ? 'Bu bölüm rolünüze açık değil' : 'Bu bölüm kurumunuz için kapalı'}
                      </h2>
                      <p className="text-sm text-muted">
                        {/* Aşama 259: sistem sahibinin kendi panelinde ders bölümleri yoktur */}
                        {dataService.yonetimMerkezi()
                          ? 'Ödev, etüt ve plan işleri bireysel hesabınızdan ya da kurumdaki öğretmen hesabınızdan yapılır.'
                          : dataService.rolesActive()
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
                    <DerslerSayfasi students={students} classes={classes} grades={grades} attendance={attendance} />
                  )}

                  {teacherTab === 'question_tracking' && (
                    <QuestionTrackingView
                      classes={classes}
                      students={students}
                    />
                  )}

                  {teacherTab === 'deneme' && <DenemeAnalizi students={students} classes={classes} />}

                  {teacherTab === 'akademik_takvim' && <AkademikTakvim />}

                  {/* Aşama 143: Yönetim sayfası bölümlere ayrıldı (Kurumlar · Bildirim ve SMS · Yedek ve bakım · Kendi alanım) */}
                  {teacherTab === 'user_management' && (
                    <YonetimSayfasi
                      classes={classes}
                      currentTeacher={currentTeacher}
                      onNavigateHome={() => setTeacherTab('home')}
                      onOpenGuide={() => setIsAsama25GuideOpen(true)}
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
              anaSayfaSinyal={ogrAnaSayfaSinyal}
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
      <footer className={`${kabukluAnaSayfa ? '' : 'mt-10 '}border-t border-line py-5 text-center text-xs text-subtle`}>
        <div className="max-w-[120rem] mx-auto px-4 flex items-center justify-center gap-2">
          <GraduationCap className="w-4 h-4" />
          <span>biliredu · {new Date().getFullYear()}</span>
        </div>
      </footer>
      </div>

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
      {/* Aşama 173: eski "Veritabanı Kurulum Rehberi" kaldırıldı (herkese açık kural SQL'i içeriyordu) */}

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
