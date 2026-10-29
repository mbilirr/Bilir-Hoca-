import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  ShieldCheck,
  BookOpen,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  ArrowRight,
  CalendarCheck,
  BarChart3,
  Zap,
} from 'lucide-react';
import confetti from '../../lib/confetti';
import { Teacher, Student, ClassGroup, AuthSession, UserRole } from '../../types';
import { dataService } from '../../services/dataService';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ThemeToggle } from '../ui/kit';
import {
  getBiometricSupport,
  getBiometricProfile,
  removeBiometricProfile,
  enableBiometricLogin,
  unlockBiometricLogin,
  type BiometricProfile,
} from '../../lib/biometricLogin';

// Aşama 42: giriş ekranı en son kullanılan rolde açılır (öğrenci çıkış yaptıysa öğrenci sekmesinde)
const LAST_ROLE_KEY = 'auth_last_role';
const readLastRole = (): 'teacher' | 'student' => {
  try {
    return localStorage.getItem(LAST_ROLE_KEY) === 'student' ? 'student' : 'teacher';
  } catch {
    return 'teacher';
  }
};
const writeLastRole = (role: string) => {
  try {
    if (role === 'teacher' || role === 'student') localStorage.setItem(LAST_ROLE_KEY, role);
  } catch {
    /* tarayıcı izin vermiyorsa önemli değil */
  }
};

// Parmak izi simgesi (lucide "fingerprint" çizimi; simge adının sürüme göre değişmesinden etkilenmesin diye burada)
const Fingerprint: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </svg>
);

// Aşama 110: giriş ekranının sol paneli — kara tahta yeşili ve tebeşir çizimleri (kitap, kalem, cetvel, küre, π, a²+b²).
// Desen küçük bir SVG'dir (resim dosyası indirilmez); panel telefonda gizlidir.
const CHALK_BG = '#1f3b33';
const CHALK_PATTERN = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22260%22%20height%3D%22260%22%20viewBox%3D%220%200%20260%20260%22%3E%3Cg%20stroke%3D%22%23fff%22%20stroke-opacity%3D%22.11%22%20fill%3D%22none%22%20stroke-width%3D%221.6%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%2040h34a6%206%200%200%201%206%206v30H26a6%206%200%200%200-6%206zM60%2046a6%206%200%200%201%206-6h34v36H66a6%206%200%200%200-6%206%22%2F%3E%3Cpath%20d%3D%22M150%2020l50%2050-8%208-50-50zM142%2028l-6%2014%2014-6%22%2F%3E%3Crect%20x%3D%2230%22%20y%3D%22150%22%20width%3D%2280%22%20height%3D%2218%22%20rx%3D%222%22%2F%3E%3Cpath%20d%3D%22M40%20150v7M50%20150v5M60%20150v7M70%20150v5M80%20150v7M90%20150v5M100%20150v7%22%2F%3E%3Ccircle%20cx%3D%22200%22%20cy%3D%22170%22%20r%3D%2226%22%2F%3E%3Cellipse%20cx%3D%22200%22%20cy%3D%22170%22%20rx%3D%2211%22%20ry%3D%2226%22%2F%3E%3Cpath%20d%3D%22M174%20170h52M178%20157h44M178%20183h44M120%20220l18-30%2018%2030zM190%20225q10-14%2020%200t20%200%22%2F%3E%3C%2Fg%3E%3Cg%20fill%3D%22%23fff%22%20fill-opacity%3D%22.11%22%20font-family%3D%22Georgia%2Cserif%22%20font-style%3D%22italic%22%3E%3Ctext%20x%3D%22120%22%20y%3D%22120%22%20font-size%3D%2222%22%3Ea%C2%B2%2Bb%C2%B2%3C%2Ftext%3E%3Ctext%20x%3D%2220%22%20y%3D%22115%22%20font-size%3D%2226%22%3E%CF%80%3C%2Ftext%3E%3Ctext%20x%3D%22215%22%20y%3D%22115%22%20font-size%3D%2220%22%3E%E2%88%91%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fsvg%3E';
const CHALK_FEATURES = [
  { icon: BookOpen, text: 'Ödev ve haftalık plan' },
  { icon: CalendarCheck, text: 'Etüt ve yoklama' },
  { icon: BarChart3, text: 'Deneme analizi ve karne' },
];

interface AuthPortalProps {
  onAuthSuccess: (session: AuthSession) => void;
  classes: ClassGroup[];
  students: Student[];
  teachers: Teacher[];
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  onAuthSuccess,
  classes,
  students,
  teachers,
}) => {
  // Aşama 108: öğrenci kendi kaydını yapamaz (öğrenciyi kurum ekler); giriş ekranında kayıt bölümü yoktur.
  // Selected role tab for login/register: 'teacher' | 'student'
  const [selectedRole, setSelectedRole] = useState<UserRole>(() => readLastRole());

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // Common notification feedback
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Remember Me & Easy Login (Role-specific separation)
  const [rememberedTeacher, setRememberedTeacher] = useState(() => dataService.getRememberedUser('teacher'));
  const [rememberedStudent, setRememberedStudent] = useState(() => dataService.getRememberedUser('student'));
  const [rememberMe, setRememberMe] = useState(() => Boolean(dataService.getRememberedUser(readLastRole())));

  // Listen to dataService updates so remembered users & teachers stay synchronized
  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      const curTeacher = dataService.getRememberedUser('teacher');
      const curStudent = dataService.getRememberedUser('student');
      setRememberedTeacher(curTeacher);
      setRememberedStudent(curStudent);
    });
    return () => unsub();
  }, []);

  // Active remembered user strictly matches selectedRole
  const activeRememberedUser = selectedRole === 'teacher' ? rememberedTeacher : rememberedStudent;

  // --- LOGIN FORM STATE ---
  const [loginUsername, setLoginUsername] = useState(() => {
    const rem = dataService.getRememberedUser(readLastRole());
    return rem?.identifier || '';
  });
  const [loginPassword, setLoginPassword] = useState('');

  // --- PARMAK İZİ İLE GİRİŞ (WebAuthn) ---
  // Cihaz/tarayıcı desteği: denetlenene kadar "checked: false"; desteklenmiyorsa nedeni ekranda yazılır
  const [bioSupport, setBioSupport] = useState<{ checked: boolean; ok: boolean; reason: string }>({ checked: false, ok: false, reason: '' });
  const bioAvailable = bioSupport.ok;
  const [bioProfiles, setBioProfiles] = useState<{ teacher: BiometricProfile | null; student: BiometricProfile | null }>(() => ({
    teacher: getBiometricProfile('teacher'),
    student: getBiometricProfile('student'),
  }));
  const [enableBio, setEnableBio] = useState(false);
  // Aşama 42: parmak izi açılamazsa (ya da "Şifreyle gir") şifre formu gösterilir
  const [bioFallback, setBioFallback] = useState(false);
  // Şifreyle giriş başarılı ve parmak izi açılmak isteniyor: kayıt adımı (tarayıcı kuralı gereği ayrı düğmeyle)
  const [pendingBio, setPendingBio] = useState<{ session: AuthSession; identifier: string; name: string; password: string } | null>(null);
  useEffect(() => {
    let alive = true;
    getBiometricSupport().then((r) => alive && setBioSupport({ checked: true, ...r }));
    return () => {
      alive = false;
    };
  }, []);
  const refreshBioProfiles = () => setBioProfiles({ teacher: getBiometricProfile('teacher'), student: getBiometricProfile('student') });
  const activeBioProfile = selectedRole === 'teacher' ? bioProfiles.teacher : bioProfiles.student;
  // Aşama 42: parmak izi kayıtlıysa yalnızca tek "Giriş" düğmesi gösterilir (cihaz denetlenirken de)
  const bioMode = !!activeBioProfile && !bioFallback && (bioAvailable || !bioSupport.checked);

  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  // Handle role switch in login tab
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    writeLastRole(role);
    setBioFallback(false);
    setError(null);
    setSuccessMsg(null);
    const rem = dataService.getRememberedUser(role);
    if (rem) {
      setLoginUsername(rem.identifier);
      setRememberMe(true);
    } else {
      setLoginUsername('');
      setRememberMe(false);
    }
    setLoginPassword('');
  };

  const handleForgetRememberedUser = () => {
    dataService.setRememberedUser(null, selectedRole);
    if (selectedRole === 'teacher') {
      setRememberedTeacher(null);
    } else {
      setRememberedStudent(null);
    }
    setLoginUsername('');
    setLoginPassword('');
    setRememberMe(false);
  };

  // --- ŞİFREMİ UNUTTUM ---
  // Gerçek e-posta ile kayıtlı hesaplara Supabase sıfırlama bağlantısı gönderilir.
  // Sistemin ürettiği adresleri kullanan öğretmen/öğrenci hesaplarında şifreyi yönetici belirler.
  const handleForgotPassword = async () => {
    setError(null);
    setSuccessMsg(null);

    if (selectedRole === 'student') {
      setSuccessMsg(
        'Şifrenizi unuttuysanız öğretmeninize veya okul yöneticinize başvurunuz. Size yeni bir şifre belirleyeceklerdir.'
      );
      return;
    }

    const ident = loginUsername.trim().toLowerCase();
    const isRealEmail = ident.includes('@') && !ident.endsWith('@okul.internal.net');
    if (!isRealEmail) {
      setSuccessMsg(
        'Öğretmen hesaplarında şifreyi yönetici yeniler; lütfen yöneticinize başvurunuz. Hesabınız gerçek bir e-posta adresiyle kayıtlıysa, e-posta adresinizi yukarıdaki kutuya yazıp tekrar "Şifremi unuttum"a basınız.'
      );
      return;
    }

    setIsLoading(true);
    try {
      await dataService.sendPasswordResetEmail(ident);
      setSuccessMsg(
        'Bu e-posta adresi sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu ve gereksiz (spam) klasörünü kontrol ediniz.'
      );
    } catch (err: any) {
      setError(err?.message || 'Sıfırlama e-postası gönderilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  // Oturumu açar ve panele geçer
  const finishLogin = (session: AuthSession, greeting: string) => {
    writeLastRole(session.role);
    dataService.setAuthSession(session);
    confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    setSuccessMsg(greeting);
    setTimeout(() => onAuthSuccess(session), 400);
  };
  const greetingOf = (session: AuthSession) =>
    session.role === 'teacher'
      ? `Hoş geldiniz Sn. ${session.user.name}! Panele yönlendiriliyorsunuz...`
      : `Hoş geldin ${session.user.name}! Öğrenci paneline yönlendiriliyorsunuz...`;

  // Kullanıcı adı + şifreyle doğrular. Başarılıysa oturum nesnesi, hatalı bilgide null döner.
  const authenticate = async (role: UserRole, cleanUser: string, cleanPass: string): Promise<AuthSession | null> => {
    if (role === 'teacher') {
      const teacher = await dataService.authenticateTeacher(cleanUser, cleanPass);
      if (!teacher) return null;
      if (rememberMe) {
        dataService.setRememberedUser({
          role: 'teacher',
          identifier: teacher.username,
          name: teacher.name,
          avatar: teacher.avatar,
          branch: teacher.branch,
        });
        setRememberedTeacher(dataService.getRememberedUser('teacher'));
      } else {
        dataService.setRememberedUser(null, 'teacher');
        setRememberedTeacher(null);
      }
      return { role: 'teacher', user: teacher };
    }
    const student = await dataService.authenticateStudent(cleanUser, cleanPass);
    if (!student) return null;
    if (rememberMe) {
      dataService.setRememberedUser({
        role: 'student',
        identifier: student.studentNumber || student.username,
        name: student.name,
        avatar: student.avatar,
        className: student.className,
      });
      setRememberedStudent(dataService.getRememberedUser('student'));
    } else {
      dataService.setRememberedUser(null, 'student');
      setRememberedStudent(null);
    }
    return { role: 'student', user: student };
  };

  // --- SUBMIT LOGIN ---
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanUser = loginUsername.trim();
    const cleanPass = loginPassword.trim();

    if (!cleanUser || !cleanPass) {
      setError('Lütfen kullanıcı adı ve şifrenizi giriniz.');
      return;
    }

    setIsLoading(true);

    try {
      const session = await authenticate(selectedRole, cleanUser, cleanPass);
      if (!session) {
        setError(
          selectedRole === 'teacher'
            ? 'Kullanıcı adı veya şifre hatalı. Lütfen kontrol edip tekrar deneyiniz.'
            : 'Öğrenci numarası veya şifre hatalı. Şifrenizi bilmiyorsanız öğretmeninize başvurunuz.'
        );
        return;
      }
      if (enableBio && bioAvailable) {
        // Parmak izi kaydı için ayrı bir onay adımı gösterilir (oturum bu adımdan sonra açılır)
        setPendingBio({ session, identifier: cleanUser, name: session.user.name, password: cleanPass });
        setLoginPassword('');
        return;
      }
      finishLogin(session, greetingOf(session));
    } catch (err: any) {
      setError(err.message || 'Giriş yapılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- PARMAK İZİ KAYDI (şifreyle girişten hemen sonra) ---
  const handleEnableBiometric = async () => {
    if (!pendingBio) return;
    setError(null);
    setIsLoading(true);
    const { session, identifier, name, password } = pendingBio;
    try {
      await enableBiometricLogin({ role: session.role as 'teacher' | 'student', identifier, name, password });
      refreshBioProfiles();
      setPendingBio(null);
      setEnableBio(false);
      finishLogin(session, `Parmak izi girişi açıldı. ${greetingOf(session)}`);
    } catch (err: any) {
      setError(`${err?.message || 'Parmak izi girişi açılamadı.'} İsterseniz "Şimdi değil" ile devam edebilirsiniz.`);
    } finally {
      setIsLoading(false);
    }
  };
  const handleSkipBiometric = () => {
    if (!pendingBio) return;
    const { session } = pendingBio;
    setPendingBio(null);
    setEnableBio(false);
    finishLogin(session, greetingOf(session));
  };

  // --- PARMAK İZİ İLE GİRİŞ ---
  const handleBiometricLogin = async () => {
    const role = selectedRole as 'teacher' | 'student';
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);
    try {
      const cred = await unlockBiometricLogin(role);
      const session = await authenticate(role, cred.identifier, cred.password);
      if (!session) {
        // Şifre değişmiş: eski kayıt artık işe yaramaz
        removeBiometricProfile(role);
        refreshBioProfiles();
        setLoginUsername(cred.identifier);
        setBioFallback(true);
        setError('Şifreniz değiştiği için parmak izi girişi kapatıldı. Lütfen yeni şifrenizle girip "Parmak izi ile girişi aç" kutusunu yeniden işaretleyin.');
        return;
      }
      finishLogin(session, greetingOf(session));
    } catch (err: any) {
      // Aşama 42: parmak izi açılamadı → şifreyle girişe yönlendir (kullanıcı adı hazır gelir)
      const prof = getBiometricProfile(role);
      if (prof) setLoginUsername(prof.identifier);
      setBioFallback(true);
      setError(`${err?.message || 'Parmak izi ile giriş yapılamadı.'} Lütfen şifrenizle giriş yapın.`);
      setTimeout(() => passwordInputRef.current?.focus(), 80);
    } finally {
      setIsLoading(false);
    }
  };
  const goPasswordLogin = () => {
    if (activeBioProfile) setLoginUsername(activeBioProfile.identifier);
    setBioFallback(true);
    setError(null);
    setTimeout(() => passwordInputRef.current?.focus(), 80);
  };
  const handleRemoveBiometric = () => {
    removeBiometricProfile(selectedRole as 'teacher' | 'student');
    refreshBioProfiles();
    setSuccessMsg('Bu cihazdaki parmak izi girişi kaldırıldı.');
  };

  return (
    <div className="auth-chalk min-h-screen w-full flex bg-surface-2 text-fg font-sans">
      {/* Aşama 110: sol marka paneli (yalnızca geniş ekranda) — kara tahta yeşili, tebeşir çizimleri (resim dosyası yok) */}
      <aside
        className="hidden lg:flex w-[44%] max-w-[640px] shrink-0 flex-col justify-between p-10 xl:p-14 text-white"
        style={{ backgroundColor: CHALK_BG, backgroundImage: `url("${CHALK_PATTERN}")` }}
        id="auth-brand-panel"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 p-1.5 flex items-center justify-center">
            <img src="/logo.svg" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-base font-bold tracking-tight">Eğitim & Öğrenci Takip Sistemi</span>
        </div>
        <div>
          <h1 className="text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight">
            Okulunuzun tüm takibi
            <br />
            tek ekranda
          </h1>
          <p className="mt-3 text-sm text-white/70">Ödev, etüt, yoklama ve deneme sonuçları tek yerde.</p>
          <ul className="mt-8 space-y-3.5">
            {CHALK_FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-white/85">
                <span className="w-8 h-8 rounded-lg bg-amber-300/15 border border-amber-300/35 text-amber-300 flex items-center justify-center">
                  <f.icon className="w-4 h-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-white/45">© {new Date().getFullYear()} • Eğitim & Öğrenci Takip Sistemi</p>
      </aside>

      {/* Sağ: giriş formu */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2.5 lg:invisible min-w-0">
            <span className="w-9 h-9 rounded-xl border border-line bg-surface p-1.5 flex items-center justify-center shrink-0">
              <img src="/logo.svg" alt="Eğitim Takip Logo" className="w-full h-full object-contain" />
            </span>
            <span className="text-sm font-bold text-fg truncate">Eğitim & Öğrenci Takip Sistemi</span>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex items-center justify-center px-4 pb-8 sm:px-6">
          <div className="w-full max-w-[400px] bg-surface border border-line rounded-2xl shadow-sm p-6 sm:p-7">
            <h2 className="text-lg font-extrabold text-fg tracking-tight">Giriş Yap</h2>
            <p className="text-xs text-muted mt-0.5 mb-5">Hesabınızla devam edin</p>

            {/* Rol seçimi (tek şerit) */}
            <div className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-surface-2 border border-line" role="tablist" aria-label="Giriş yapılacak rol">
              {(
                [
                  { role: 'teacher', label: 'Öğretmen', icon: ShieldCheck },
                  { role: 'student', label: 'Öğrenci', icon: BookOpen },
                ] as const
              ).map((r) => {
                const on = selectedRole === r.role;
                return (
                  <button
                    key={r.role}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    id={`auth-role-${r.role}`}
                    onClick={() => handleSelectRole(r.role)}
                    className={`h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      on ? 'bg-surface text-brand-fg shadow-sm border border-line' : 'text-muted hover:text-fg'
                    }`}
                  >
                    <r.icon className="w-3.5 h-3.5" />
                    {r.label}
                  </button>
                );
              })}
            </div>

              {/* Error & Success Feedback Alerts */}
              {error && (
                <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl flex items-start space-x-3 text-red-700 dark:text-red-300 text-xs sm:text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="flex-1">{error}</div>
                </div>
              )}

              {successMsg && (
                <div className="mb-5 p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-start space-x-3 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-700 dark:text-emerald-400 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{successMsg}</div>
                </div>
              )}

              {/* ================= MODE 1: LOGIN ================= */}
              {/* ================= PARMAK İZİ KAYIT ADIMI ================= */}
              {pendingBio && (
                <div id="biometric-enroll" className="space-y-4 p-5 rounded-2xl border border-line bg-brand-soft">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center shrink-0">
                      <Fingerprint className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-fg">Parmak izinizi kaydedin</h3>
                      <p className="text-xs text-muted leading-relaxed mt-1">
                        Şifreniz doğrulandı. Aşağıdaki düğmeye basınca cihazınız parmak izinizi (veya yüz tanımayı) isteyecek.
                        Bundan sonra bu cihazda şifre yazmadan, parmak izinizle giriş yapabilirsiniz. Parmak iziniz cihazınızdan çıkmaz.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleEnableBiometric}
                      disabled={isLoading}
                      isLoading={isLoading}
                      loadingText="Parmak izi bekleniyor..."
                      leftIcon={<Fingerprint className="w-4 h-4" />}
                      className="flex-1"
                    >
                      Parmak izimi kaydet
                    </Button>
                    <Button type="button" variant="ghost" onClick={handleSkipBiometric} disabled={isLoading} className="sm:w-40">
                      Şimdi değil
                    </Button>
                  </div>
                </div>
              )}

              {!pendingBio && (
                <div className="space-y-5">
                  {/* Aşama 42: PARMAK İZİ AÇIKSA tek "Giriş" düğmesi — önce parmak izi, sorun olursa şifre formu */}
                  {bioMode && activeBioProfile && (
                    <div id="biometric-login" className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-2xl border border-line bg-surface">
                        <span className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center shrink-0">
                          <Fingerprint className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-fg truncate">{activeBioProfile.name || activeBioProfile.identifier}</p>
                          <p className="text-[11px] text-muted">{selectedRole === 'teacher' ? 'Öğretmen hesabı' : 'Öğrenci hesabı'}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        id="biometric-login-btn"
                        onClick={handleBiometricLogin}
                        disabled={isLoading}
                        isLoading={isLoading}
                        loadingText="Parmak izi bekleniyor..."
                        leftIcon={<Fingerprint className="w-4 h-4" />}
                        className="w-full"
                      >
                        Giriş
                      </Button>
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <button type="button" id="biometric-use-password" onClick={goPasswordLogin} className="font-semibold hover:text-fg cursor-pointer">
                          Şifreyle gir
                        </button>
                        <button type="button" onClick={handleRemoveBiometric} className="font-semibold hover:text-red-600 dark:hover:text-red-300 cursor-pointer">
                          Parmak izini kaldır
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ROL İLE TAM UYUMLU BENİ HATIRLA - HIZLI GİRİŞ KARTI */}
                  {!bioMode && activeRememberedUser && (
                    <div className="p-4 rounded-2xl border transition-all bg-brand-soft border-line">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          <img
                            src={
                              activeRememberedUser.avatar ||
                              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                activeRememberedUser.name
                              )}`
                            }
                            alt={activeRememberedUser.name}
                            className="w-11 h-11 rounded-xl bg-surface border border-line shadow-xs object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-[11px] font-medium text-muted flex items-center space-x-1">
                                <Zap className="w-3.5 h-3.5 text-subtle" />
                                <span>Kayıtlı Profil:</span>
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-surface text-brand-fg border-line">
                                {selectedRole === 'teacher' ? 'Öğretmen Hesabı' : 'Öğrenci Hesabı'}
                              </span>
                            </div>
                            <div className="text-sm sm:text-base font-bold text-fg tracking-tight truncate">
                              {activeRememberedUser.name}
                            </div>
                            <div className="text-xs text-muted truncate">
                              {activeRememberedUser.branch ||
                                activeRememberedUser.className ||
                                activeRememberedUser.identifier}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-auto">
                          {/* Aşama 45: "Bu Hesapla Devam Et" kaldırıldı; kullanıcı adı zaten dolu, yalnızca şifre girilip "Giriş Yap"a basılır */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleForgetRememberedUser}
                            className="text-muted hover:text-red-600 dark:hover:text-red-300"
                            title="Bu rol için kayıtlı profili kaldır"
                          >
                            Unut
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between text-[11px] text-muted">
                        <span>Şifrenizi girip “Giriş Yap”a basın. Farklı hesapla girmek için kullanıcı adını değiştirin.</span>
                      </div>
                    </div>
                  )}

                  {!bioMode && (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <Input
                      label={
                        selectedRole === 'teacher'
                          ? 'Öğretmen Kullanıcı Adı veya E-posta *'
                          : 'Öğrenci Numarası *'
                      }
                      type="text"
                      required
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={
                        selectedRole === 'teacher'
                          ? 'Kullanıcı adı veya e-posta'
                          : 'Örn: 1042'
                      }
                      leftIcon={<User className="w-4 h-4" />}
                    />

                    <Input
                      ref={passwordInputRef}
                      label="Şifre *"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="••••••••"
                      leftIcon={<Lock className="w-4 h-4" />}
                      rightIcon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      onRightIconClick={() => setShowPassword(!showPassword)}
                      rightIconLabel="Şifreyi göster/gizle"
                    />

                    {/* BENİ HATIRLA ONAY KUTUSU (Remember Me) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-semibold text-muted select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-line-strong accent-[var(--color-brand)] cursor-pointer"
                        />
                        <span>Beni Hatırla</span>
                      </label>
                      {!activeBioProfile && bioAvailable && (
                        <label
                          className={`flex items-center space-x-2.5 text-xs font-semibold select-none ${bioAvailable ? 'cursor-pointer text-muted' : 'cursor-not-allowed text-subtle'}`}
                          id="biometric-optin"
                          title={bioAvailable ? 'Girişten sonra parmak izinizi kaydedersiniz' : bioSupport.reason || 'Cihaz denetleniyor'}
                        >
                          <input
                            type="checkbox"
                            checked={enableBio && bioAvailable}
                            disabled={!bioAvailable}
                            onChange={(e) => setEnableBio(e.target.checked)}
                            className="w-4 h-4 rounded border-line-strong accent-[var(--color-brand)] cursor-pointer"
                          />
                          <Fingerprint className="w-4 h-4 text-brand-fg" />
                          <span>Parmak izi ile girişi aç</span>
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isLoading}
                        className="ml-auto text-xs font-semibold text-brand-fg hover:underline cursor-pointer disabled:opacity-50"
                      >
                        Şifremi unuttum
                      </button>
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isLoading}
                      isLoading={isLoading}
                      loadingText="Giriş Yapılıyor..."
                      rightIcon={<ArrowRight className="w-4 h-4" />}
                      className="w-full"
                    >
                      Giriş Yap
                    </Button>
                  </form>
                  )}
                </div>
              )}

            </div>
        </div>

        <footer className="lg:hidden text-center py-4 text-[11px] text-subtle">
          © {new Date().getFullYear()} • Eğitim & Öğrenci Takip Sistemi
        </footer>
      </main>
    </div>
  );
};
