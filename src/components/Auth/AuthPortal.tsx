import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Teacher, Student, ClassGroup, AuthSession, UserRole } from '../../types';
import { dataService } from '../../services/dataService';
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

// Aşama 222: yeni giriş ekranı (Fikir 1) — koyu marka paneli + açık form. Logo dosyası aynı (/logo.svg), yanında "bilirEdu".
// Başlık yazı tipi (Instrument Serif) yalnız bu ekranda ve yalnız başlıktaki harfler için yüklenir (birkaç KB);
// gelene kadar başlık Georgia ile görünür, giriş kutuları hiç beklemez.
const AUTH_HEADLINE = 'Her öğrencinin yolculuğu, tek bakışta.';
const AUTH_SERIF_ID = 'auth-serif-font';
const loadAuthSerif = () => {
  try {
    if (document.getElementById(AUTH_SERIF_ID)) return;
    const link = document.createElement('link');
    link.id = AUTH_SERIF_ID;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap&text=' + encodeURIComponent(AUTH_HEADLINE);
    document.head.appendChild(link);
  } catch {
    /* yazı tipi gelmezse başlık Georgia ile görünür */
  }
};

// Logonun çizgileri: marka panelinin arkasında büyük ve silik (resim dosyası değil, sayfanın içinde küçük bir çizim)
const AuthStrokes: React.FC = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true" className="auth-strokes">
    <defs>
      <linearGradient id="auth-st-e" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5eead4" stopOpacity="0.55" />
        <stop offset="1" stopColor="#0f766e" stopOpacity="0.12" />
      </linearGradient>
      <linearGradient id="auth-st-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f4f1ea" stopOpacity="0.22" />
        <stop offset="1" stopColor="#f4f1ea" stopOpacity="0.03" />
      </linearGradient>
      <linearGradient id="auth-st-c" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f3c78d" />
        <stop offset="1" stopColor="#b9763c" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="13" fill="none" stroke="url(#auth-st-c)" strokeWidth="0.25" opacity="0.6" />
    <path d="M51 11H27V50H51M27 30.5H46.68" fill="none" stroke="url(#auth-st-e)" strokeWidth="8.4" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M11 24V50M11 24H19.5Q25.5 24 25.5 30Q25.5 37 19.5 37H11M19.5 37Q27.5 37 27.5 42.9Q27.5 50 19.5 50H11"
      fill="none"
      stroke="url(#auth-st-b)"
      strokeWidth="6.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M49 42v10M44 47h10" fill="none" stroke="url(#auth-st-c)" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);

// Aşama 222: giriş kutusu (etiket üstte, hata altta). Ortak Input yerine burada: bu ekran her zaman açık zemindir,
// sistem koyu temadayken bile kutular ve hata yazıları açık zemine göre renklenir.
type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; right?: React.ReactNode };
const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(({ label, error, right, id, className = '', ...rest }, ref) => {
  const gid = React.useId();
  const iid = id || gid;
  return (
    <div className="space-y-1.5">
      <label htmlFor={iid} className="block text-[13px] lg:text-xs font-semibold text-fg-2">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={iid}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${iid}-error` : undefined}
          className={`auth-input ${right ? 'pr-12' : ''} ${error ? 'is-err' : ''} ${className}`}
          {...rest}
        />
        {right}
      </div>
      {error && (
        <p id={`${iid}-error`} className="auth-err-text text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
});
AuthField.displayName = 'AuthField';

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
  // Aşama 201: giriş bilgisi hatası ilgili alanın altında (genel hatalar yine üstte)
  const [fieldErr, setFieldErr] = useState<{ user?: string; pass?: string }>({});
  // Aşama 201: şifre yazılırken büyük harf kilidi (Caps Lock) açıksa uyarı
  const [capsOn, setCapsOn] = useState(false);
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
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  // Aşama 222: başlık yazı tipi yalnız giriş ekranında yüklenir; telefonda tarayıcı üst çubuğu koyu panelle aynı renk olur
  // (ekrandan çıkınca eski rengine döner)
  useEffect(() => {
    loadAuthSerif();
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', '#0f241b');
    return () => {
      if (meta && prev !== null) meta.setAttribute('content', prev);
    };
  }, []);

  // Aşama 201: ekran açılınca (ve rol değişince) imleç ilk boş alanda. Yalnız fare / dokunmatik yüzey olan cihazlarda:
  // telefonda kendiliğinden açılan klavye ekranın yarısını kapatırdı.
  useEffect(() => {
    if (bioMode || pendingBio) return;
    let fine = false;
    try {
      fine = window.matchMedia('(pointer: fine)').matches;
    } catch {
      fine = false;
    }
    if (!fine) return;
    const id = window.setTimeout(() => {
      const target = usernameInputRef.current && !usernameInputRef.current.value ? usernameInputRef.current : passwordInputRef.current;
      if (target && document.activeElement !== target) target.focus();
    }, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, bioMode, !!pendingBio]);
  const capsOf = (e: React.KeyboardEvent<HTMLInputElement>) => {
    try {
      setCapsOn(e.getModifierState('CapsLock'));
    } catch {
      /* eski tarayıcı: uyarı gösterilmez */
    }
  };

  // Handle role switch in login tab
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    writeLastRole(role);
    setBioFallback(false);
    setError(null);
    setFieldErr({});
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
    setFieldErr({});
    // Aşama 201: "Başka hesap" sonrası imleç kullanıcı adı kutusunda
    window.setTimeout(() => usernameInputRef.current?.focus(), 30);
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
  // Aşama 201: konfeti ve "yönlendiriliyorsunuz" beklemesi (0,4 sn) kaldırıldı; panel hemen açılır
  const finishLogin = (session: AuthSession) => {
    writeLastRole(session.role);
    dataService.setAuthSession(session);
    onAuthSuccess(session);
  };

  // Kullanıcı adı + şifreyle doğrular. Başarılıysa oturum nesnesi, hatalı bilgide null döner.
  const authenticate = async (role: UserRole, cleanUser: string, cleanPass: string): Promise<AuthSession | null> => {
    if (role === 'teacher') {
      const teacher = await dataService.authenticateTeacher(cleanUser, cleanPass);
      if (!teacher) return null;
      if (rememberMe) {
        dataService.setRememberedUser({
          role: 'teacher',
          // Aşama 173: kutuda kullanıcı adı görünür (yazılan kullanıcı adı, e-postayla girildiyse hesabın kullanıcı adı).
          // Gerçek e-postayla açılmış hesapta giriş adresi gizli `loginEmail` alanında saklanır; kullanıcı adıyla
          // girişte authenticateTeacher bu adresi kullanır (172'deki gibi kutuya e-posta yazılmaz).
          identifier: cleanUser.includes('@') ? teacher.username || cleanUser : cleanUser,
          loginEmail: dataService.realTeacherLoginEmail() || undefined,
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
    setFieldErr({});
    setSuccessMsg(null);

    const cleanUser = loginUsername.trim();
    const cleanPass = loginPassword.trim();

    // Aşama 201: boş alan uyarısı o alanın altında (tarayıcının kendi "doldurun" balonu yerine; required kaldırıldı)
    if (!cleanUser || !cleanPass) {
      setFieldErr({
        user: !cleanUser ? (selectedRole === 'teacher' ? 'Kullanıcı adınızı yazın.' : 'Öğrenci numaranızı yazın.') : undefined,
        pass: !cleanPass ? 'Şifrenizi yazın.' : undefined,
      });
      (!cleanUser ? usernameInputRef.current : passwordInputRef.current)?.focus();
      return;
    }

    setIsLoading(true);

    try {
      const session = await authenticate(selectedRole, cleanUser, cleanPass);
      if (!session) {
        // Aşama 201: kısa ve şifre alanının altında
        setFieldErr({
          pass:
            selectedRole === 'teacher'
              ? cleanUser.includes('@')
                ? 'E-posta veya şifre hatalı.'
                : // Aşama 172: gerçek e-postayla açılmış hesap kullanıcı adıyla bulunamaz (giriş ekranında liste boş)
                  'Kullanıcı adı veya şifre hatalı. Hesabınız e-postayla açıldıysa e-posta adresinizi yazın.'
              : 'Numara veya şifre hatalı. Şifrenizi bilmiyorsanız öğretmeninize başvurun.',
        });
        passwordInputRef.current?.focus();
        return;
      }
      if (enableBio && bioAvailable) {
        // Parmak izi kaydı için ayrı bir onay adımı gösterilir (oturum bu adımdan sonra açılır)
        // Aşama 172: öğretmende parmak izi kaydına da gerçek giriş adresi yazılır (beni hatırla ile aynı kural)
        const bioIdentifier =
          session.role === 'teacher' ? dataService.rememberIdentifierForTeacher(session.user as Teacher, cleanUser) : cleanUser;
        setPendingBio({ session, identifier: bioIdentifier, name: session.user.name, password: cleanPass });
        setLoginPassword('');
        return;
      }
      finishLogin(session);
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
      finishLogin(session);
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
    finishLogin(session);
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
      finishLogin(session);
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

  // Aşama 222: şifre formundayken (parmak izi kayıtlıysa) yandaki kare düğme parmak izi girişine geri döner
  const goBioLogin = () => {
    setBioFallback(false);
    setError(null);
    setFieldErr({});
  };
  const canBioLogin = !!activeBioProfile && bioAvailable;

  return (
    <div className="auth-v2 relative min-h-[100dvh] w-full font-sans flex flex-col md:p-5 lg:grid lg:grid-cols-12 lg:gap-4 lg:p-4">
      {/* Aşama 222: marka paneli — telefonda üstte kısa, tablette üstte geniş, bilgisayarda solda tam boy */}
      <section
        id="auth-brand-panel"
        className="auth-brand relative overflow-hidden flex flex-col gap-6 px-7 pb-8 pt-[max(20px,env(safe-area-inset-top))] md:rounded-[32px] md:gap-12 md:px-12 md:pt-12 md:pb-[124px] lg:col-span-7 lg:rounded-[24px] lg:justify-between lg:gap-8 lg:px-14 lg:py-12"
      >
        <AuthStrokes />
        <div className="relative flex items-center gap-2.5 md:gap-3">
          <img src="/logo.svg?v=167" alt="" className="w-[30px] h-[30px] md:w-10 md:h-10" draggable={false} />
          <span className="auth-wordmark text-lg md:text-[22px]" aria-label="bilirEdu">
            bilir<span>Edu</span>
          </span>
        </div>
        <div className="relative flex flex-col gap-7">
          <h1 className="auth-serif m-0 text-[30px] leading-[1.05] md:text-[66px] md:leading-[0.98] lg:text-[clamp(56px,6vw,84px)] lg:leading-[0.95]">
            Her öğrencinin
            <br className="hidden md:inline" /> <span className="auth-gold">yolculuğu</span>,
            <br />
            tek bakışta.
          </h1>
          <div className="hidden md:flex items-center gap-2.5" aria-hidden="true">
            <span className="auth-pill">
              <b className="bg-amber-400" />
              Öğrenci
            </span>
            <span className="auth-pill">
              <b className="bg-[#f4f1ea]" />
              Öğretmen
            </span>
            <span className="auth-pill">
              <b className="bg-emerald-300" />
              Veli
            </span>
          </div>
        </div>
      </section>

      {/* Aşama 222: form — telefonda alttan açılan açık panel, tablette panelin üstüne taşan kart, bilgisayarda sağda açık zemin */}
      <main className="auth-sheet relative z-10 flex-1 flex flex-col px-6 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] md:flex-none md:-mt-24 md:px-0 md:pt-0 lg:mt-0 lg:col-span-5 lg:justify-center lg:px-[clamp(32px,4vw,56px)] lg:py-8">
        <div className="auth-card w-full md:mx-auto md:w-[520px] md:p-9 lg:w-full lg:max-w-[400px] lg:p-0">
          <div className="hidden md:block mb-5">
            <h2 className="text-[26px] lg:text-[28px] font-bold text-fg tracking-tight leading-tight">Giriş yap</h2>
            <p className="text-sm text-muted mt-1">Kaldığınız yerden devam edin.</p>
          </div>

          {/* Rol seçimi (tek şerit) */}
          <div className="auth-seg grid grid-cols-2 gap-1 p-1 mb-5" role="tablist" aria-label="Giriş yapılacak rol">
            {(
              [
                { role: 'teacher', label: 'Öğretmen' },
                { role: 'student', label: 'Öğrenci' },
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
                  className={`auth-seg-btn inline-flex items-center justify-center text-sm lg:text-[13px] font-semibold cursor-pointer ${on ? 'is-on' : ''}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Genel hata ve bilgi kutuları */}
          {error && (
            <div className="auth-alert is-err mb-5" role="alert">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="auth-alert is-ok mb-5" role="status">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* ================= PARMAK İZİ KAYIT ADIMI ================= */}
          {pendingBio && (
            <div id="biometric-enroll" className="space-y-4 p-5 rounded-2xl border border-line bg-surface">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center shrink-0">
                  <Fingerprint className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Parmak izinizi kaydedin</h3>
                  <p className="text-xs text-muted leading-relaxed mt-1">
                    Şifreniz doğrulandı. Düğmeye basınca cihazınız parmak izinizi (veya yüz tanımayı) ister. Bundan sonra bu cihazda
                    şifre yazmadan girersiniz. Parmak iziniz cihazınızdan çıkmaz.
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
                <Button type="button" variant="ghost" onClick={handleSkipBiometric} disabled={isLoading} className="auth-ghost sm:w-40">
                  Şimdi değil
                </Button>
              </div>
            </div>
          )}

          {!pendingBio && (
            <div className="space-y-5">
              {/* Aşama 42 + 222: PARMAK İZİ AÇIKSA profil satırı + büyük parmak izi düğmesi; sorun olursa şifre formu */}
              {bioMode && activeBioProfile && (
                <div id="biometric-login" className="space-y-5">
                  <div className="auth-profile">
                    <span className="auth-avatar">
                      <Fingerprint className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-fg truncate">{activeBioProfile.name || activeBioProfile.identifier}</p>
                      <p className="text-xs text-muted">{selectedRole === 'teacher' ? 'Öğretmen' : 'Öğrenci'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    id="biometric-login-btn"
                    onClick={handleBiometricLogin}
                    disabled={isLoading}
                    className="auth-bio-big mx-auto flex flex-col items-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    <span className="auth-bio-tile">
                      <Fingerprint className="w-10 h-10" />
                    </span>
                    <span className="text-[15px] font-bold text-fg">{isLoading ? 'Parmak izi bekleniyor...' : 'Parmak izi ile giriş'}</span>
                  </button>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <button type="button" id="biometric-use-password" onClick={goPasswordLogin} className="auth-link-btn">
                      Şifreyle gir
                    </button>
                    <button type="button" onClick={handleRemoveBiometric} className="auth-link-btn is-danger">
                      Parmak izini kaldır
                    </button>
                  </div>
                </div>
              )}

              {/* ROL İLE TAM UYUMLU BENİ HATIRLA - HIZLI GİRİŞ KARTI */}
              {/* Aşama 201: tek satır — fotoğraf, ad ve "Başka hesap" (kayıtlı profili kaldırır, kutuyu boşaltır) */}
              {!bioMode && activeRememberedUser && (
                <div className="auth-profile" id="auth-kayitli-profil">
                  <img
                    src={profilResmi(activeRememberedUser, selectedRole === 'teacher' ? 'teacher' : 'student')}
                    alt=""
                    className="w-10 h-10 rounded-full bg-surface-2 border border-line object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                    {activeRememberedUser.name}
                    {(activeRememberedUser.branch || activeRememberedUser.className) && (
                      <span className="font-normal text-muted"> · {activeRememberedUser.branch || activeRememberedUser.className}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    id="auth-baska-hesap"
                    onClick={handleForgetRememberedUser}
                    title="Kayıtlı profili bu cihazdan kaldırır"
                    className="auth-link-btn shrink-0 h-9 px-2"
                  >
                    Başka hesap
                  </button>
                </div>
              )}

              {!bioMode && (
                <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                  <AuthField
                    ref={usernameInputRef}
                    label={selectedRole === 'teacher' ? 'Kullanıcı adı veya e-posta' : 'Öğrenci numarası'}
                    type="text"
                    aria-required="true"
                    autoComplete="username"
                    error={fieldErr.user}
                    value={loginUsername}
                    onChange={(e) => {
                      setLoginUsername(e.target.value);
                      if (fieldErr.user || fieldErr.pass) setFieldErr({});
                    }}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={selectedRole === 'teacher' ? 'Kullanıcı adınız' : 'Örn: 1042'}
                  />

                  <AuthField
                    ref={passwordInputRef}
                    label="Şifre"
                    type={showPassword ? 'text' : 'password'}
                    aria-required="true"
                    autoComplete="current-password"
                    error={fieldErr.pass}
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (fieldErr.pass) setFieldErr((f) => ({ ...f, pass: undefined }));
                    }}
                    onKeyDown={capsOf}
                    onKeyUp={capsOf}
                    onBlur={() => setCapsOn(false)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Şifreniz"
                    right={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                        className="auth-eye"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    }
                  />
                  {capsOn && (
                    <p className="auth-caps -mt-2 flex items-center gap-1.5 text-xs font-semibold" id="auth-caps-uyari" role="status">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Büyük harf kilidi (Caps Lock) açık
                    </p>
                  )}

                  {/* BENİ HATIRLA ONAY KUTUSU (Remember Me) */}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-h-8">
                    <label className="flex items-center gap-2.5 cursor-pointer text-sm lg:text-[13px] text-fg-2 select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="auth-check"
                      />
                      <span>Beni hatırla</span>
                    </label>
                    {!activeBioProfile && bioAvailable && (
                      <label
                        className="flex items-center gap-2.5 cursor-pointer text-sm lg:text-[13px] text-fg-2 select-none"
                        id="biometric-optin"
                        title="Girişten sonra parmak izinizi kaydedersiniz"
                      >
                        <input
                          type="checkbox"
                          checked={enableBio && bioAvailable}
                          onChange={(e) => setEnableBio(e.target.checked)}
                          className="auth-check"
                        />
                        <Fingerprint className="w-4 h-4 text-brand-fg" />
                        <span>Parmak izi ile girişi aç</span>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isLoading}
                      className="auth-link-btn ml-auto text-sm lg:text-[13px] disabled:opacity-50"
                    >
                      Şifremi unuttum
                    </button>
                  </div>

                  {/* Giriş düğmesi; parmak izi kayıtlıysa yanında kare parmak izi düğmesi */}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isLoading}
                      isLoading={isLoading}
                      loadingText="Giriş yapılıyor..."
                      className="auth-cta flex-1"
                    >
                      Giriş yap
                    </Button>
                    {canBioLogin && (
                      <button
                        type="button"
                        id="biometric-back-btn"
                        onClick={goBioLogin}
                        disabled={isLoading}
                        aria-label="Parmak izi ile giriş"
                        title="Parmak izi ile giriş"
                        className="auth-icon-btn"
                      >
                        <Fingerprint className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <footer className="mt-auto pt-6 text-center text-[11px] text-muted md:mt-6 lg:mt-0 lg:absolute lg:left-0 lg:right-0 lg:bottom-6 lg:pt-0">
          © {new Date().getFullYear()} bilirEdu
        </footer>
      </main>
    </div>
  );
};
