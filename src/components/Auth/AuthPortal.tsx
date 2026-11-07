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
import { profilResmi } from '../../lib/profilResmi';
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

// Aşama 166: yeni logo — B-E simgesi + "BAŞARI & EĞİTİM" yazısı (turkuaz-yeşil geçiş) + ÖĞRENCİ – ÖĞRETMEN – VELİ satırı.
// Telefonda dikey, tablet ve bilgisayarda yatay dizilir; yazı bloğu simgeyle dikey ortalıdır. Resim dosyası yalnızca /logo.svg.
const AuthLockup: React.FC = () => (
  <div className="auth-lockup flex flex-col items-center md:flex-row md:items-center gap-0 md:gap-5 xl:gap-[22px]">
    <div className="relative shrink-0 w-[76px] h-[76px] md:w-[92px] md:h-[92px] xl:w-[98px] xl:h-[98px]">
      <img src="/logo.svg?v=167" alt="Başarı ve Eğitim" className="w-full h-full" draggable={false} />
    </div>
    <div className="mt-4 md:mt-0 flex flex-col justify-center md:h-[92px] xl:h-[98px] w-max">
      <h1 className="auth-word relative leading-none whitespace-nowrap text-[24.8px] md:text-[30px] lg:text-[28px] xl:text-[32px]" aria-label="Başarı ve Eğitim">
        <span aria-hidden="true" className="auth-word-shadow absolute left-[3px] top-[3px]">BAŞARI <i>&amp;</i> EĞİTİM</span>
        <span className="auth-word-main relative">BAŞARI <i>&amp;</i> EĞİTİM</span>
      </h1>
      <div className="auth-sub mt-2 md:mt-2.5 w-full flex items-center justify-between whitespace-nowrap font-semibold text-slate-400 text-[9.5px] tracking-[.1em] md:text-[11.5px] md:tracking-[.14em] xl:text-xs">
        <span className="inline-flex items-center"><b className="bg-amber-400" />ÖĞRENCİ</span>
        <span className="opacity-50">–</span>
        <span className="inline-flex items-center"><b className="bg-white" />ÖĞRETMEN</span>
        <span className="opacity-50">–</span>
        <span className="inline-flex items-center"><b className="bg-emerald-300" />VELİ</span>
      </div>
    </div>
  </div>
);
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
    <div className="auth-v2 relative min-h-screen w-full overflow-hidden font-sans" data-theme="dark">
      {/* Aşama 166: zemin — bilgisayarda aurora ışıkları, tablet ve telefonda bakır parıltı */}
      <div className="auth-aurora" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-7 px-6 py-8 lg:flex-row lg:justify-between lg:gap-12 lg:px-[clamp(132px,calc((100vw_-_884px)/2),150px)] xl:px-[150px]">
        {/* Marka: logo + (yalnız bilgisayarda) başlık, cümle, liste */}
        <section id="auth-brand-panel" className="relative flex flex-col items-center lg:items-start lg:flex-1 lg:min-w-0 lg:justify-center lg:gap-16 lg:self-stretch">
          <div className="mb-5 lg:mb-0 lg:-ml-[92px] xl:-ml-[98px]">
            <AuthLockup />
          </div>
          <div className="hidden lg:block">
            <p className="auth-headline text-[34px] xl:text-[38px] font-extrabold leading-[1.15] tracking-tight">
              Ödevden karneye
              <br />
              her adım takipte
            </p>
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
          <p className="hidden lg:block absolute left-0 bottom-8 text-[11px] text-white/45">© {new Date().getFullYear()} • BAŞARI &amp; EĞİTİM</p>
        </section>

        {/* Giriş formu */}
        <main className="w-full max-w-[342px] md:max-w-[520px] lg:max-w-[420px] lg:w-[420px] lg:flex-none">
          <div className="auth-card w-full p-[22px] md:p-9 lg:p-[34px]">
            <h2 className="text-[22px] md:text-[26px] lg:text-2xl font-bold text-fg tracking-tight">
              Hoş geldiniz
            </h2>
            <p className="text-xs text-muted mt-1 mb-5">Hesabınızla devam edin</p>

            {/* Rol seçimi (tek şerit) */}
            <div className="auth-seg grid grid-cols-2 gap-1 p-1 mb-5" role="tablist" aria-label="Giriş yapılacak rol">
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
                    className={`auth-seg-btn h-9 inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer ${
                      on ? 'is-on' : 'text-muted hover:text-fg'
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
                      className="auth-cta flex-1"
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
                        className="auth-cta w-full"
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
                            src={profilResmi(activeRememberedUser, selectedRole === 'teacher' ? 'teacher' : 'student')}
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
                      className="auth-cta w-full"
                    >
                      Giriş Yap
                    </Button>
                  </form>
                  )}
                </div>
              )}

          </div>
        </main>

        <footer className="lg:hidden text-center text-[11px] text-white/45">
          © {new Date().getFullYear()} • BAŞARI &amp; EĞİTİM
        </footer>
      </div>
    </div>
  );
};
